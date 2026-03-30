export type Role = 'lab_user' | 'admin'

export interface User {
  id: number
  email: string
  role: Role
  labId: number | null
}

export interface Lab {
  id: number
  lab_number: number
  name: string
  participant_count: number
  created_at: string
}

export interface Participant {
  id: number
  lab_id: number
  participant_code: string
  condition_order: 0 | 1
  age: number | null
  gender: string | null
  language: string
  created_at: string
}

export interface Session {
  id: string
  labDay: number
  sessionType: 'encoding' | 'test1' | 'test2'
  condition: 'sleep' | 'wake'
  startedAt: string | null
  completedAt: string | null
}

export interface ParticipantDetail extends Participant {
  sessions: Session[]
}
