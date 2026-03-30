INSERT INTO config (key, value) VALUES ('input', '{
    "memoryOldKey": "KeyW",
    "memoryNewKey": "KeyP",
    "resumeKey": "KeyQ",
    "ratingKeys": ["Digit1","Digit2","Digit3","Digit4","Digit5","Digit6","Digit7","Digit8","Digit9"]
}') ON CONFLICT (key) DO NOTHING;
