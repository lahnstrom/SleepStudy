import type { PoolClient } from 'pg'

type Emotion = 'negative' | 'neutral'
type EncodingRole = 'encoding_test1_target' | 'encoding_test2_target'
type FoilRole = 'test1_foil' | 'test2_foil'
type ImageRole = EncodingRole | FoilRole

interface Img { id: number; emotion: Emotion }
interface EncodingItem extends Img { role: EncodingRole }
interface TestItem extends Img { isTarget: boolean }

export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// Encoding: balanced halves.
// Full: first 40 = 20 neg + 20 neu (shuffled), second 40 = same.
// Neutral-only (no neg): first 40 = 40 neu shuffled, second 40 = 40 neu shuffled.
export function orderEncoding(items: EncodingItem[]): EncodingItem[] {
  const neg = items.filter(i => i.emotion === 'negative')
  const neu = items.filter(i => i.emotion === 'neutral')
  if (neg.length === 0) {
    return [...shuffle(neu.slice(0, 40)), ...shuffle(neu.slice(40))]
  }
  return [
    ...shuffle([...neg.slice(0, 20), ...neu.slice(0, 20)]),
    ...shuffle([...neg.slice(20), ...neu.slice(20)]),
  ]
}

// Test session: 4-way balanced halves (emotion × target/foil).
// Full: each half = 10 neuTarget + 10 negTarget + 10 neuFoil + 10 negFoil.
// Neutral-only (no neg): each half = 20 neuTarget + 20 neuFoil.
export function orderTest(targets: TestItem[], foils: TestItem[]): TestItem[] {
  const neuTgt = targets.filter(i => i.emotion === 'neutral')
  const negTgt = targets.filter(i => i.emotion === 'negative')
  const neuFoil = foils.filter(i => i.emotion === 'neutral')
  const negFoil = foils.filter(i => i.emotion === 'negative')

  if (negTgt.length === 0) {
    return [
      ...shuffle([...neuTgt.slice(0, 20), ...neuFoil.slice(0, 20)]),
      ...shuffle([...neuTgt.slice(20), ...neuFoil.slice(20)]),
    ]
  }
  return [
    ...shuffle([...neuTgt.slice(0, 10), ...negTgt.slice(0, 10), ...neuFoil.slice(0, 10), ...negFoil.slice(0, 10)]),
    ...shuffle([...neuTgt.slice(10), ...negTgt.slice(10), ...neuFoil.slice(10), ...negFoil.slice(10)]),
  ]
}

async function batchInsert(
  client: PoolClient,
  participantId: number,
  day: number,
  rows: Array<{ imageId: number; role: ImageRole; presentationPosition: number }>
): Promise<void> {
  if (rows.length === 0) return
  const params: unknown[] = []
  const clauses = rows.map(row => {
    params.push(participantId, row.imageId, day, row.role, row.presentationPosition)
    const b = params.length - 4
    return `($${b}, $${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`
  })
  await client.query(
    `INSERT INTO participant_image_assignments (participant_id, image_id, lab_day, image_role, presentation_position) VALUES ${clauses.join(', ')}`,
    params
  )
}

async function updateTestPositions(
  client: PoolClient,
  participantId: number,
  day: number,
  orderedItems: TestItem[],
  roles: ImageRole[]
): Promise<void> {
  const params: unknown[] = [participantId, day, roles]
  const clauses = orderedItems.map((item, i) => {
    params.push(i + 1, item.id)
    return `($${params.length - 1}::int, $${params.length}::int)`
  })
  await client.query(`
    WITH pos_map(test_position, image_id) AS (VALUES ${clauses.join(', ')})
    UPDATE participant_image_assignments a
    SET test_position = p.test_position
    FROM pos_map p
    WHERE a.participant_id = $1
      AND a.lab_day = $2
      AND a.image_id = p.image_id
      AND a.image_role = ANY($3::image_role[])
  `, params)
}

export async function getNeutralOnlyMode(client: PoolClient): Promise<boolean> {
  const result = await client.query<{ value: boolean }>(
    "SELECT value FROM config WHERE key = 'neutral_only_mode'"
  )
  return result.rows[0]?.value === true
}

export async function generateImageAssignments(
  client: PoolClient,
  participantId: number,
  neutralOnly: boolean
): Promise<void> {
  let negPool: Img[] = []
  let neuPool: Img[]

  if (neutralOnly) {
    const { rows } = await client.query<{ id: number }>(
      "SELECT id FROM images WHERE emotion = 'neutral'"
    )
    if (rows.length < 320) {
      throw new Error(`Need at least 320 neutral images for neutral-only mode, have ${rows.length}`)
    }
    neuPool = shuffle(rows.map(r => ({ id: r.id, emotion: 'neutral' as const })))
  } else {
    const [negRes, neuRes] = await Promise.all([
      client.query<{ id: number }>("SELECT id FROM images WHERE emotion = 'negative'"),
      client.query<{ id: number }>("SELECT id FROM images WHERE emotion = 'neutral'"),
    ])
    if (negRes.rows.length < 160) {
      throw new Error(`Need at least 160 negative images, have ${negRes.rows.length}`)
    }
    if (neuRes.rows.length < 160) {
      throw new Error(`Need at least 160 neutral images, have ${neuRes.rows.length}`)
    }
    negPool = shuffle(negRes.rows.map(r => ({ id: r.id, emotion: 'negative' as const })))
    neuPool = shuffle(neuRes.rows.map(r => ({ id: r.id, emotion: 'neutral' as const })))
  }

  for (const day of [1, 2] as const) {
    const off = (day - 1) * (neutralOnly ? 160 : 80)
    const dayNeg = negPool.slice(off, off + 80)
    const dayNeu = neutralOnly
      ? neuPool.slice(off, off + 160)
      : neuPool.slice(off, off + 80)

    // Encoding (80 items)
    const encodingItems: EncodingItem[] = neutralOnly
      ? [
          ...dayNeu.slice(0, 40).map(i => ({ ...i, role: 'encoding_test1_target' as const })),
          ...dayNeu.slice(40, 80).map(i => ({ ...i, role: 'encoding_test2_target' as const })),
        ]
      : [
          ...dayNeg.slice(0, 20).map(i => ({ ...i, role: 'encoding_test1_target' as const })),
          ...dayNeu.slice(0, 20).map(i => ({ ...i, role: 'encoding_test1_target' as const })),
          ...dayNeg.slice(20, 40).map(i => ({ ...i, role: 'encoding_test2_target' as const })),
          ...dayNeu.slice(20, 40).map(i => ({ ...i, role: 'encoding_test2_target' as const })),
        ]

    const orderedEncoding = orderEncoding(encodingItems)
    await batchInsert(client, participantId, day,
      orderedEncoding.map((item, idx) => ({ imageId: item.id, role: item.role, presentationPosition: idx + 1 }))
    )

    // Test1 foils (40 items)
    const test1FoilPool: Img[] = neutralOnly
      ? dayNeu.slice(80, 120)
      : [...dayNeg.slice(40, 60), ...dayNeu.slice(40, 60)]
    const shuffledTest1Foils = shuffle(test1FoilPool)
    await batchInsert(client, participantId, day,
      shuffledTest1Foils.map((img, idx) => ({ imageId: img.id, role: 'test1_foil' as const, presentationPosition: idx + 1 }))
    )

    // Test1 combined ordering
    const test1Targets: TestItem[] = orderedEncoding
      .filter(i => i.role === 'encoding_test1_target')
      .map(i => ({ id: i.id, emotion: i.emotion, isTarget: true }))
    const test1Foils: TestItem[] = shuffledTest1Foils.map(i => ({ ...i, isTarget: false }))
    const orderedTest1 = orderTest(test1Targets, test1Foils)
    await updateTestPositions(client, participantId, day, orderedTest1,
      ['encoding_test1_target', 'test1_foil']
    )

    // Test2 foils (40 items)
    const test2FoilPool: Img[] = neutralOnly
      ? dayNeu.slice(120, 160)
      : [...dayNeg.slice(60, 80), ...dayNeu.slice(60, 80)]
    const shuffledTest2Foils = shuffle(test2FoilPool)
    await batchInsert(client, participantId, day,
      shuffledTest2Foils.map((img, idx) => ({ imageId: img.id, role: 'test2_foil' as const, presentationPosition: idx + 1 }))
    )

    // Test2 combined ordering
    const test2Targets: TestItem[] = orderedEncoding
      .filter(i => i.role === 'encoding_test2_target')
      .map(i => ({ id: i.id, emotion: i.emotion, isTarget: true }))
    const test2Foils: TestItem[] = shuffledTest2Foils.map(i => ({ ...i, isTarget: false }))
    const orderedTest2 = orderTest(test2Targets, test2Foils)
    await updateTestPositions(client, participantId, day, orderedTest2,
      ['encoding_test2_target', 'test2_foil']
    )
  }
}
