/** Demo data for Project Beatles (TTS Bench) — no API calls. */
window.ARENA_DATA = {
  meta: {
    title: "Project Beatles (TTS Bench)",
    language: "hi-IN",
    version: "prototype-0.1",
    promptPolicy: "Input = Hindi script text only (no metadata wrapping)",
  },

  models: [
    {
      id: "gemini",
      name: "Gemini 3.1 Flash TTS",
      provider: "Google",
      slug: "google/gemini-3.1-flash-tts-preview",
      voice: "Kore",
      voiceLabel: "Kore — balanced, clear",
      color: "#4285f4",
    },
    {
      id: "fish",
      name: "Fish S2.1 Pro Free",
      provider: "Fish Audio",
      slug: "fish-audio/s2.1-pro-free:free",
      voice: "b1a1d760d9604bdb957a56eec3460f1b",
      voiceLabel: "Indian Lady — female, clear Indian accent",
      color: "#22c55e",
    },
    {
      id: "mai",
      name: "MAI-Voice-2",
      provider: "Microsoft",
      slug: "microsoft/mai-voice-2",
      voice: "hi-IN-SwaraNeural",
      voiceLabel: "Swara — Hindi female",
      color: "#0078d4",
    },
    {
      id: "grok",
      name: "Grok Voice TTS 1.0",
      provider: "xAI",
      slug: "x-ai/grok-voice-tts-1.0",
      voice: "eve",
      voiceLabel: "Eve — female",
      color: "#a855f7",
    },
  ],

  // Seeded demo votes — split by vote type (model ranking vs human parity).
  seedVotes: {
    model_vs_model: [
      { winner: "gemini", loser: "fish", n: 18 },
      { winner: "gemini", loser: "mai", n: 14 },
      { winner: "gemini", loser: "grok", n: 12 },
      { winner: "fish", loser: "mai", n: 11 },
      { winner: "fish", loser: "grok", n: 9 },
      { winner: "mai", loser: "grok", n: 8 },
    ],
    model_vs_human: [
      { winner: "human", loser: "grok", n: 22 },
      { winner: "human", loser: "mai", n: 19 },
      { winner: "human", loser: "fish", n: 15 },
      { winner: "human", loser: "gemini", n: 11 },
      { winner: "gemini", loser: "human", n: 7 },
      { winner: "fish", loser: "human", n: 5 },
    ],
  },

  // Seeded issue-tag counts (demo baseline; your votes add on top).
  seedIssueCounts: {
    gemini: { mispronunciation: 4, unnatural: 2 },
    fish: { mispronunciation: 6, robotic: 3, codeswitch: 2 },
    mai: { robotic: 5, unnatural: 4 },
    grok: { mispronunciation: 7, robotic: 4, glitch: 2 },
  },

  samples: [
    {
      scriptId: 1,
      speaker: "Chirag",
      domain: "Cinema",
      namedEntity: "Shah Rukh Khan (SRK)",
      text: "बॉलीवुड के बादशाह शाहरुख़ ख़ान, जिन्हें प्रशंसक संक्षेप में एस.आर.के. पुकारते हैं, की भावप्रवण अदाकारी दर्शकों को भावुक कर देती है।",
      meaning:
        "Bollywood's badshah Shah Rukh Khan, whom fans affectionately call SRK for short, moves audiences to tears with his emotionally expressive acting.",
      referenceAudio: "audio/hi_01_Chirag.mp3",
      clips: {
        gemini: "outputs/voice_samples/gemini_Kore.wav",
        fish: "outputs/voice_samples/fish_b1a1d760d9604bdb957a56eec3460f1b.mp3",
        mai: "outputs/voice_samples/mai_hi-IN-SwaraNeural.mp3",
        grok: "outputs/voice_samples/grok_eve.mp3",
      },
      demoComplete: true,
    },
    {
      scriptId: 2,
      speaker: "Shubh",
      domain: "Music/Pop",
      namedEntity: "Diljit Dosanjh",
      text: "पंजाबी गायक एवं ऐक्टर दिलजीत दोसांझ की ऊर्जावान प्रस्तुतियों ने अंतरराष्ट्रीय मंचों पर पंजाबी संस्कृति को गौरवान्वित किया।",
      meaning:
        "Punjabi singer and actor Diljit Dosanjh's energetic performances brought pride to Punjabi culture on international stages.",
      referenceAudio: "audio/hi_02_Shubh.wav",
      clips: {},
      demoComplete: false,
    },
    {
      scriptId: 3,
      speaker: "Geetesh",
      domain: "Rap",
      namedEntity: "Raftaar",
      text: "रैपर रफ़्तार के धारदार बोल और तीव्र लयबद्धता ने भारतीय हिप-हॉप संगीत को एक नई पहचान दिलाई।",
      meaning:
        "Rapper Raftaar's sharp lyrics and intense rhythm gave Indian hip-hop music a new identity.",
      referenceAudio: "audio/hi_03_Geetesh.m4a",
      clips: {},
      demoComplete: false,
    },
    {
      scriptId: 4,
      speaker: "Vishrut",
      domain: "Classical Music",
      namedEntity: "Pandit Ravi Shankar",
      text: "सितार वादक पंडित रविशंकर की अलौकिक प्रस्तुतियों ने पश्चिमी जगत को भारतीय शास्त्रीय संगीत से परिचित कराया।",
      meaning:
        "Sitar player Pandit Ravi Shankar's divine performances introduced the Western world to Indian classical music.",
      referenceAudio: "audio/hi_04_Vishrut.mp3",
      clips: {},
      demoComplete: false,
    },
    {
      scriptId: 5,
      speaker: "Akshat",
      domain: "Sports",
      namedEntity: "Neeraj Chopra",
      text: "भाला फेंक खिलाड़ी नीरज चोपड़ा की ऐतिहासिक स्वर्ण पदक विजयी उपलब्धि ने संपूर्ण देश को गौरवान्वित किया।",
      meaning:
        "Javelin thrower Neeraj Chopra's historic gold-medal-winning achievement made the entire nation proud.",
      referenceAudio: "audio/hi_05_Akshat.m4a",
      clips: {},
      demoComplete: false,
    },
    {
      scriptId: 6,
      speaker: "Chirag",
      domain: "Science (Acronym)",
      namedEntity: "ISRO",
      text: "इसरो द्वारा संचालित चंद्रयान अभियान की अभूतपूर्व सफलता ने भारत को अंतरिक्ष अनुसंधान में अग्रणी राष्ट्र बना दिया।",
      meaning:
        "The unprecedented success of the Chandrayaan mission conducted by ISRO made India a leading nation in space research.",
      referenceAudio: "audio/hi_06_Chirag.mp3",
      clips: {},
      demoComplete: false,
    },
  ],

  issueTags: [
    { id: "mispronunciation", label: "Mispronunciation (name/entity)" },
    { id: "unnatural", label: "Unnatural prosody" },
    { id: "robotic", label: "Robotic / metallic" },
    { id: "codeswitch", label: "Code-switch error (English bit)" },
    { id: "emotion", label: "Emotion mismatch" },
    { id: "glitch", label: "Cut-off / glitch" },
  ],
};
