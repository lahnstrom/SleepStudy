INSERT INTO config (key, value) VALUES ('timing_practice', '{
  "fixationVisible": 2750,
  "fixationBlank": 250,
  "imageDisplay": 1000,
  "memoryTimeout": 3000,
  "postMemoryGap": 1000,
  "ratingTimeout": 4000,
  "interRatingGap": 1000,
  "pauseDuration": 60000,
  "pauseTrialIndex": 40
}') ON CONFLICT (key) DO NOTHING;
