import { useState, useEffect, useCallback } from "react";

export type Language = "en" | "hinglish" | "hi";

export const LANGUAGE_STORAGE_KEY = "trounce_language";
export const LANGUAGE_EVENT = "trounce_language_change";

export interface LanguageOption {
  code: Language;
  label: string;
  native: string;
  short: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English", native: "English", short: "EN" },
  { code: "hinglish", label: "Hinglish", native: "Hinglish", short: "Hing" },
  { code: "hi", label: "Hindi", native: "हिन्दी", short: "हिं" },
];

export const translations = {
  // Navigation
  nav_practice: {
    en: "Practice",
    hinglish: "Practice",
    hi: "अभ्यास",
  },
  nav_progress: {
    en: "Progress",
    hinglish: "Progress",
    hi: "प्रगति",
  },
  nav_profile: {
    en: "Profile",
    hinglish: "Profile",
    hi: "प्रोफाइल",
  },
  nav_dashboard: {
    en: "Dashboard",
    hinglish: "Dashboard",
    hi: "डैशबोर्ड",
  },
  nav_assignments: {
    en: "Assignments",
    hinglish: "Assignments",
    hi: "असाइनमेंट्स",
  },
  nav_flags: {
    en: "Flags",
    hinglish: "Flags",
    hi: "फ्लैग्स",
  },
  nav_reports: {
    en: "Reports",
    hinglish: "Reports",
    hi: "रिपोर्ट्स",
  },
  nav_users: {
    en: "Users & Teachers",
    hinglish: "Users & Teachers",
    hi: "उपयोगकर्ता व शिक्षक",
  },
  nav_settings: {
    en: "Settings",
    hinglish: "Settings",
    hi: "सेटिंग्स",
  },
  sign_out: {
    en: "Sign out",
    hinglish: "Sign out",
    hi: "लॉगआउट",
  },
  student_badge: {
    en: "Student",
    hinglish: "Student",
    hi: "छात्र",
  },
  console_btn: {
    en: "Console ➜",
    hinglish: "Console ➜",
    hi: "कंसोल ➜",
  },

  // Student Practice Home
  greeting_streak: {
    en: "Hello, {name}! Your practice streak",
    hinglish: "Namaste {name}! Aapka practice streak",
    hi: "नमस्ते {name}! आपका अभ्यास स्ट्रीक",
  },
  days_count: {
    en: "Days 🔥",
    hinglish: "Days 🔥",
    hi: "दिन 🔥",
  },
  this_week: {
    en: "This Week",
    hinglish: "Is Hafte",
    hi: "इस सप्ताह",
  },
  completed_of: {
    en: "{completed} / {total} completed",
    hinglish: "{completed} / {total} complete hue",
    hi: "{completed} / {total} पूर्ण",
  },
  streak_done_msg: {
    en: "Great job! Today's practice is completed.",
    hinglish: "Shabash! Aaj ki practice complete ho gayi.",
    hi: "शाबाश! आज का अभ्यास पूरा हो चुका है।",
  },
  streak_pending_msg: {
    en: "Record 1 practice today to keep your streak alive!",
    hinglish: "Streak banaye rakhne ke liye aaj 1 practice record karein!",
    hi: "अपनी स्ट्रीक जारी रखने के लिए आज 1 अभ्यास रिकॉर्ड करें!",
  },
  teacher_notes_title: {
    en: "Teacher Notes",
    hinglish: "Teacher ke Notes",
    hi: "शिक्षक का संदेश",
  },
  assigned_homework_title: {
    en: "Assigned Homework",
    hinglish: "Aaj ka Homework",
    hi: "आज का गृहकार्य",
  },
  tasks_count: {
    en: "{count} Tasks",
    hinglish: "{count} Tasks",
    hi: "{count} कार्य",
  },
  status_done: {
    en: "Done",
    hinglish: "Done",
    hi: "पूर्ण",
  },
  status_late: {
    en: "Late",
    hinglish: "Late",
    hi: "विलंबित",
  },
  status_pending: {
    en: "Pending",
    hinglish: "Pending",
    hi: "बाकी है",
  },
  prompt_label: {
    en: "Topic Prompt",
    hinglish: "Topic Prompt",
    hi: "बोलने का विषय",
  },
  status_submitted: {
    en: "Submitted",
    hinglish: "Submitted",
    hi: "जमा हो गया",
  },
  due_date: {
    en: "Due: {date}",
    hinglish: "Due date: {date}",
    hi: "अंतिम तिथि: {date}",
  },
  due_date_passed: {
    en: "Past due: {date}",
    hinglish: "Due date nikal gayi: {date}",
    hi: "अंतिम तिथि समाप्त: {date}",
  },
  listen_or_retake_btn: {
    en: "Listen or Retake ➜",
    hinglish: "Sunen ya Retake karein ➜",
    hi: "सुनें या दोबारा बोलें ➜",
  },
  record_homework_btn: {
    en: "Record Homework ➜",
    hinglish: "Homework Record Karein ➜",
    hi: "होमवर्क रिकॉर्ड करें ➜",
  },
  practice_drills_title: {
    en: "Practice Drills",
    hinglish: "Practice Drills",
    hi: "अभ्यास ड्रिल्स",
  },
  practice_drills_sub: {
    en: "Build fluency by speaking on varied real-world topics",
    hinglish: "Alag-alag topics par bolkar apni fluency improve karein",
    hi: "विभिन्न विषयों पर बोलकर अपनी बोलने की क्षमता बेहतर बनाएं",
  },
  available_count: {
    en: "{count} Available",
    hinglish: "{count} Available",
    hi: "{count} उपलब्ध",
  },
  target_goal: {
    en: "Target: {sec}s",
    hinglish: "Target: {sec}s",
    hi: "लक्ष्य: {sec}s",
  },
  level_beginner: {
    en: "Beginner",
    hinglish: "Beginner",
    hi: "शुरुआती",
  },
  level_intermediate: {
    en: "Intermediate",
    hinglish: "Intermediate",
    hi: "मध्यम",
  },
  level_advanced: {
    en: "Advanced",
    hinglish: "Advanced",
    hi: "उन्नत",
  },
  listen_action: {
    en: "Listen ➜",
    hinglish: "Sunen ➜",
    hi: "सुनें ➜",
  },
  speak_action: {
    en: "Speak ➜",
    hinglish: "Bolen ➜",
    hi: "बोलें ➜",
  },

  // Practice & Assignment Recording Studio
  back_to_hub: {
    en: "Back to Practice Hub",
    hinglish: "Back to Practice Hub",
    hi: "अभ्यास हब पर वापस जाएं",
  },
  back_btn: {
    en: "Back",
    hinglish: "Back",
    hi: "पीछे जाएं",
  },
  completed_evaluated: {
    en: "Completed & Evaluated",
    hinglish: "Completed & Evaluated",
    hi: "पूर्ण व मूल्यांकित",
  },
  completed_submitted: {
    en: "Completed & Submitted",
    hinglish: "Completed & Submitted",
    hi: "पूर्ण व जमा",
  },
  retaking_indicator: {
    en: "Retaking Response",
    hinglish: "Dobara bol rahe hain (Retaking)",
    hi: "दोबारा रिकॉर्ड कर रहे हैं",
  },
  cancel_retake: {
    en: "Cancel Retake",
    hinglish: "Cancel Retake",
    hi: "रद्द करें",
  },
  listen_prompt_btn: {
    en: "Listen",
    hinglish: "Sunen",
    hi: "सुनें",
  },
  stop_listen_btn: {
    en: "Stop",
    hinglish: "Rukein",
    hi: "रोकें",
  },
  speak_target_hint: {
    en: "Goal: Speak for at least ~{sec} seconds",
    hinglish: "Goal: Kam se kam ~{sec} seconds bolen",
    hi: "लक्ष्य: कम से कम ~{sec} सेकंड बोलें",
  },
  speaking_tips_btn: {
    en: "💡 Speaking Tips",
    hinglish: "💡 Bolne ke Tips",
    hi: "💡 बोलने के टिप्स",
  },
  hide_tips_btn: {
    en: "Hide Tips",
    hinglish: "Tips Chhupayein",
    hi: "टिप्स छुपाएं",
  },
  tips_starter_label: {
    en: "You can start your answer like this:",
    hinglish: "Aap aise bolna shuru kar sakte hain:",
    hi: "आप ऐसे बोलना शुरू कर सकते हैं:",
  },
  tips_point_1: {
    en: "Speak naturally and clearly without rushing.",
    hinglish: "Aaram se aur saaf shabdon mein bolen.",
    hi: "शांत रहकर स्पष्ट और स्वाभाविक गति में बोलें।",
  },
  tips_point_2: {
    en: "It is okay to pause briefly to think rather than saying 'umm'.",
    hinglish: "'Umm' kehne se behtar hai ki sochne ke liye chhota pause lein.",
    hi: "'Umm' कहने के बजाय थोड़ा रुककर सोचना बेहतर है।",
  },
  mic_settings_btn: {
    en: "Mic Settings",
    hinglish: "Mic Settings",
    hi: "माइक सेटिंग्स",
  },
  hide_mic_settings_btn: {
    en: "Hide Mic Settings",
    hinglish: "Mic Settings Chhupayein",
    hi: "माइक सेटिंग्स छुपाएं",
  },
  mic_input_label: {
    en: "Microphone Input Source:",
    hinglish: "Microphone Input Source:",
    hi: "माइक्रोफ़ोन इनपुट स्रोत:",
  },
  recording_live_banner: {
    en: "Microphone is recording... keep speaking clearly!",
    hinglish: "Voice record ho rahi hai... bolte rahiye!",
    hi: "आपकी आवाज़ रिकॉर्ड हो रही है... बोलते रहिए!",
  },
  tap_to_speak: {
    en: "Tap to Speak",
    hinglish: "Bolna Shuru Karein",
    hi: "बोलना शुरू करें",
  },
  tap_to_finish: {
    en: "Stop & See Result",
    hinglish: "Rokein & Result Dekhein",
    hi: "रोकें और रिज़ल्ट देखें",
  },
  analyzing_progress: {
    en: "Saving & Analyzing...",
    hinglish: "Save & Analyze ho raha hai...",
    hi: "सेव और जांच जारी है...",
  },

  // Result & Scorecard
  analysis_completed: {
    en: "Analysis Completed",
    hinglish: "Analysis Complete",
    hi: "जांच पूरी हुई",
  },
  congrats_saved: {
    en: "Well done! Your recording was saved and evaluated.",
    hinglish: "Shabash! Aapki recording save aur check ho gayi.",
    hi: "शाबाश! आपकी रिकॉर्डिंग सफलतापूर्वक सेव और जांची गई।",
  },
  speaking_score_title: {
    en: "Overall Spoken English Score",
    hinglish: "Aapka Spoken English Score",
    hi: "कुल स्पीकिंग स्कोर",
  },
  speaking_score_sub: {
    en: "Evaluated across clarity, expression, and flow",
    hinglish: "Voice clarity, words aur flow ka evaluation",
    hi: "आवाज़ की स्पष्टता, शब्द चयन और प्रवाह का मूल्यांकन",
  },
  score_pronunciation: {
    en: "Pronunciation",
    hinglish: "Pronunciation",
    hi: "उच्चारण",
  },
  score_vocabulary: {
    en: "Vocabulary",
    hinglish: "Vocabulary",
    hi: "शब्द चयन",
  },
  score_grammar: {
    en: "Grammar",
    hinglish: "Grammar",
    hi: "व्याकरण",
  },
  recorded_audio_response: {
    en: "Your Recorded Audio Response",
    hinglish: "Aapki Recorded Audio",
    hi: "आपकी रिकॉर्ड की गई आवाज़",
  },
  legend_clear: {
    en: "Clear Speech",
    hinglish: "Clear Speech",
    hi: "स्पष्ट आवाज़",
  },
  legend_fillers: {
    en: "Fillers",
    hinglish: "Fillers",
    hi: "अनावश्यक शब्द (Fillers)",
  },
  legend_pauses: {
    en: "Pauses",
    hinglish: "Pauses",
    hi: "विराम (Pauses)",
  },
  verbatim_transcript: {
    en: "Verbatim Spoken Transcript",
    hinglish: "Spoken Transcript",
    hi: "बोली गई बातों का ट्रांसक्रिप्ट",
  },
  tap_word_to_listen: {
    en: "💡 Tap any word to hear standard pronunciation",
    hinglish: "💡 Standard pronunciation sunne ke liye kisi bhi word par tap karein",
    hi: "💡 सही उच्चारण सुनने के लिए किसी भी शब्द पर टैप करें",
  },
  listen_full_transcript: {
    en: "Listen to Full Transcript",
    hinglish: "Poora Transcript Sunen",
    hi: "पूरा ट्रांसक्रिप्ट सुनें",
  },
  feedback_title: {
    en: "Teacher & Institute Feedback",
    hinglish: "Teacher ka Feedback",
    hi: "शिक्षक का फीडबैक",
  },
  no_feedback_yet: {
    en: "Your coach has not left a note yet. Check back soon!",
    hinglish: "Teacher ne abhi tak note nahi likha hai. Jaldi hi check karein!",
    hi: "शिक्षक ने अभी तक कोई टिप्पणी नहीं छोड़ी है।",
  },
  retake_practice_btn: {
    en: "Retake Practice",
    hinglish: "Dobara Bolen (Retake)",
    hi: "दोबारा अभ्यास करें",
  },
  next_drill_btn: {
    en: "Try Another Drill",
    hinglish: "Doosra Drill Try Karein",
    hi: "अन्य ड्रिल करें",
  },

  // Progress Page
  your_progress_title: {
    en: "Your Practice Progress",
    hinglish: "Aapki Practice Progress",
    hi: "आपकी अभ्यास प्रगति",
  },
  your_progress_sub: {
    en: "Review all recorded attempts and track improvements",
    hinglish: "Apni saari recordings aur improvement track karein",
    hi: "अपनी सभी रिकॉर्डिंग और सुधार को ट्रैक करें",
  },
  trajectory_title: {
    en: "30-Day Improvement Trajectory",
    hinglish: "30-Day Improvement Trajectory",
    hi: "30-दिन का सुधार ट्रैजेक्टरी",
  },
  trajectory_good: {
    en: "Keep it up! Your speaking pace and confidence are steadily improving.",
    hinglish: "Bahut badhiya! Aapka confidence aur pace lagatar improve ho raha hai.",
    hi: "शानदार! आपकी गति और आत्मविश्वास लगातार बेहतर हो रहा है।",
  },
  trajectory_start: {
    en: "Consistent daily speaking practice builds confidence quickly.",
    hinglish: "Rozana 1 practice karne se bolne ki jhijhak jaldi door hoti hai.",
    hi: "प्रतिदिन अभ्यास करने से हिचकिचाहट तेजी से समाप्त होती है।",
  },
  no_recordings_yet: {
    en: "No recordings yet",
    hinglish: "Abhi tak koi recording nahi hai",
    hi: "अभी तक कोई रिकॉर्डिंग नहीं है",
  },
  no_recordings_sub: {
    en: "Record your first speaking drill. Your scores and waveforms will appear here.",
    hinglish: "Pehla speaking drill record karein. Aapka score aur waveform yahan dikhega.",
    hi: "अपना पहला स्पीकिंग ड्रिल रिकॉर्ड करें। आपकी प्रगति यहाँ दिखाई देगी।",
  },
  start_first_drill_btn: {
    en: "Start First Practice",
    hinglish: "Pehla Practice Shuru Karein",
    hi: "पहला अभ्यास शुरू करें",
  },

  // Teacher Dashboard & Evaluation
  batch_performance_title: {
    en: "Batch Performance & Health",
    hinglish: "Batch Performance & Health",
    hi: "बैच परफ़ॉर्मेंस और स्थिति",
  },
  students_count: {
    en: "{count} Students",
    hinglish: "{count} Students",
    hi: "{count} छात्र",
  },
  dashboard_summary_status: {
    en: "{flagged} need attention · {active} practiced today",
    hinglish: "{flagged} ko help chahiye · {active} ne aaj practice kiya",
    hi: "{flagged} छात्रों को सहायता चाहिए · आज {active} ने अभ्यास किया",
  },
  give_homework_btn: {
    en: "Assign Homework",
    hinglish: "Homework Assign Karein",
    hi: "गृहकार्य दें",
  },
  whatsapp_reports_btn: {
    en: "Parent Reports (WhatsApp)",
    hinglish: "Parent Reports (WhatsApp)",
    hi: "अभिभावक रिपोर्ट (WhatsApp)",
  },
  regular_status: {
    en: "Regular",
    hinglish: "Regular",
    hi: "नियमित",
  },
  needs_practice_status: {
    en: "Needs Practice",
    hinglish: "Practice Needed",
    hi: "अभ्यास अपेक्षित",
  },
  needs_help_status: {
    en: "Needs Help",
    hinglish: "Help Needed",
    hi: "सहायता चाहिए",
  },
  weekly_average: {
    en: "Weekly Average",
    hinglish: "Weekly Average",
    hi: "साप्ताहिक औसत",
  },
  quick_feedback_title: {
    en: "1-Click Quick Feedback:",
    hinglish: "1-Click Quick Feedback:",
    hi: "त्वरित फीडबैक:",
  },

  // Feedback Presets
  feedback_great: {
    en: "Well spoken! Good pace and clear pronunciation.",
    hinglish: "Bahut badhiya bola! Good pace aur clear pronunciation.",
    hi: "बहुत बढ़िया बोला! अच्छी गति और स्पष्ट उच्चारण।",
  },
  feedback_louder: {
    en: "Speak a little louder and clearer next time.",
    hinglish: "Thoda tez aur saaf aawaz mein bolen.",
    hi: "आवाज़ थोड़ी तेज़ और स्पष्ट रखें।",
  },
  feedback_slower: {
    en: "Speak slightly slower with natural pauses.",
    hinglish: "Thoda dheere aur natural pauses ke saath bolen.",
    hi: "थोड़ा धीरे और विराम के साथ बोलें।",
  },
  feedback_less_fillers: {
    en: "Try to reduce 'umm' and pause quietly instead.",
    hinglish: "'Umm' kam bolen, sochne ke liye quiet pause lein.",
    hi: "'Umm' कम बोलें, सोचने के लिए शांत रहें।",
  },
  feedback_daily: {
    en: "Practice 1 drill every day to build confidence.",
    hinglish: "Confidence badhane ke liye rozana 1 drill zaroor karein.",
    hi: "आत्मविश्वास के लिए प्रतिदिन 1 ड्रिल अवश्य करें।",
  },

  // Preferences & Settings Cards
  theme_pref_title: {
    en: "Theme Preference",
    hinglish: "Theme Preference",
    hi: "थीम पसंद",
  },
  theme_pref_desc: {
    en: "Choose Light for bright daylight and Dark for comfortable night viewing",
    hinglish: "Daylight ke liye Light theme aur raat ke liye Dark theme chunein",
    hi: "दिन में साफ़ पढ़ने के लिए लाइट थीम और रात में डार्क थीम चुनें",
  },
  lang_pref_title: {
    en: "Language Preference",
    hinglish: "Language Preference",
    hi: "भाषा पसंद (Language)",
  },
  lang_pref_desc: {
    en: "Choose English, conversational Hinglish, or Hindi for the app interface",
    hinglish: "App interface ke liye English, Hinglish, ya Hindi chunein",
    hi: "ऐप इंटरफ़ेस के लिए अंग्रेज़ी, हिंग्लिश या हिन्दी भाषा चुनें",
  },
  theme_dark: {
    en: "Dark",
    hinglish: "Dark",
    hi: "डार्क",
  },
  theme_light: {
    en: "Light",
    hinglish: "Light",
    hi: "लाइट",
  },
  theme_system: {
    en: "System",
    hinglish: "System",
    hi: "सिस्टम",
  },

  // Additional Result Page & Tips Keys
  tip_label: {
    en: "Tip:",
    hinglish: "Tip:",
    hi: "सुझाव:",
  },
  tip_filler: {
    en: "You used 'umm/aah' {count} time(s). Next time, take a 1-second silent pause before speaking.",
    hinglish:
      "Aapne {count} baar 'umm/aah' bola. Next time bolne se pehle 1 second ka silent pause lein.",
    hi: "आपने {count} बार 'umm/aah' बोला। अगली बार बोलने से पहले 1 सेकंड का ठहराव लें।",
  },
  tip_flow: {
    en: "Your voice flow and clarity are strong! Keep up your daily practice.",
    hinglish: "Aapki voice clarity aur flow bahut acchi hai! Daily practice jari rakhein.",
    hi: "आपकी आवाज़ का प्रवाह और स्पष्टता बहुत अच्छी है! रोज़ाना अभ्यास जारी रखें।",
  },
  evaluating_status: {
    en: "Evaluating speech...",
    hinglish: "Checking ho rahi hai...",
    hi: "जांच हो रही है...",
  },
  tap_word_tip: {
    en: "💡 Tap any word to hear standard pronunciation:",
    hinglish: "💡 Kisi bhi word par tap karke standard pronunciation sunen:",
    hi: "💡 किसी भी शब्द पर क्लिक करके उसका सही उच्चारण सुनें:",
  },
  edit_transcript_placeholder: {
    en: "Edit your spoken words here...",
    hinglish: "Apne bole gaye words yahan theek karein...",
    hi: "अपने बोले गए शब्दों को यहाँ सुधारें...",
  },
  edit_transcript_hint: {
    en: "Correct any misrecognized words. Your score will recalculate automatically.",
    hinglish: "Galat identify huye words theek karein. Score apne aap update ho jayega.",
    hi: "गलत पहचाने गए शब्दों को ठीक करें। स्कोर अपने आप दोबारा अपडेट हो जाएगा।",
  },
  generating_transcript_banner: {
    en: "Generating your voice transcript...",
    hinglish: "Voice transcript taiyar ho raha hai...",
    hi: "आपकी आवाज़ का ट्रांसक्रिप्ट तैयार हो रहा है...",
  },
  no_audio_detected_banner: {
    en: "No clear speech detected in this recording. You can click Edit to write words.",
    hinglish: "Is recording mein aawaz nahi mili. Aap Edit button se words likh sakte hain.",
    hi: "इस रिकॉर्डिंग में आवाज़ नहीं मिली। आप ऊपर Edit बटन से शब्द लिख सकते हैं।",
  },
  teacher_feedback_heading: {
    en: "Teacher Feedback",
    hinglish: "Teacher Feedback",
    hi: "शिक्षक की टिप्पणी",
  },
  teacher_feedback_pending: {
    en: "Your coach will listen to this recording and share guidance soon.",
    hinglish: "Aapke teacher jald hi recording sunkar guidance denge.",
    hi: "आपके शिक्षक जल्द ही आपकी इस रिकॉर्डिंग को सुनकर अपना मार्गदर्शन साझा करेंगे।",
  },
  sent_to_teacher_heading: {
    en: "Question Sent to Teacher",
    hinglish: "Teacher ko Question Bheja Gaya",
    hi: "शिक्षक को प्रश्न भेजा गया",
  },
  sent_to_teacher_desc: {
    en: "Your question was delivered to your teacher. They will review and guide you.",
    hinglish: "Aapka sawal teacher tak pahunch gaya hai. Wo review karke guidance denge.",
    hi: "आपका सवाल आपके शिक्षक तक पहुँच गया है। वे समीक्षा करके मार्गदर्शन देंगे।",
  },
  ask_teacher_btn: {
    en: "Ask Teacher for Help",
    hinglish: "Teacher se Doubt Poochein",
    hi: "शिक्षक से सवाल पूछें",
  },
  listen_result_btn: {
    en: "🎧 Listen & View Result ➜",
    hinglish: "🎧 Sunen & Result Dekhein ➜",
    hi: "🎧 रिज़ल्ट और आवाज़ सुनें ➜",
  },

  // Dashboard Channel Strip & Meters
  channel_strip_title: {
    en: "Student Roster · Batch Performance",
    hinglish: "Student Roster · Batch Performance",
    hi: "छात्र सूची · बैच परफ़ॉर्मेंस",
  },
  col_name: {
    en: "Name",
    hinglish: "Name",
    hi: "नाम",
  },
  col_waveform: {
    en: "Voice Waveform",
    hinglish: "Voice Waveform",
    hi: "आवाज़ वेवफॉर्म",
  },
  col_focus: {
    en: "Focus Area",
    hinglish: "Focus Area",
    hi: "सुधार क्षेत्र",
  },
  col_score: {
    en: "Score",
    hinglish: "Score",
    hi: "स्कोर",
  },
  col_trend: {
    en: "Trend",
    hinglish: "Trend",
    hi: "सुधार",
  },
  col_last_practice: {
    en: "Last Practice",
    hinglish: "Last Practice",
    hi: "अंतिम अभ्यास",
  },
  status_on_track: {
    en: "On Track",
    hinglish: "On Track",
    hi: "नियमित",
  },
  status_needs_nudge: {
    en: "Needs Nudge",
    hinglish: "Needs Nudge",
    hi: "अभ्यास बाकी",
  },
  status_flagged_help: {
    en: "Needs Help",
    hinglish: "Needs Help",
    hi: "मदद चाहिए",
  },
  meter_weekly_avg: {
    en: "Weekly Average",
    hinglish: "Weekly Average",
    hi: "साप्ताहिक औसत",
  },

  // Evaluator Presets & Controls
  evaluator_note_prompt: {
    en: "Write teacher feedback or select a 1-click preset below:",
    hinglish: "Student ke liye feedback likhein ya niche 1-click buttons chunein:",
    hi: "छात्र के लिए टिप्पणी लिखें या नीचे दिए गए त्वरित बटनों में से चुनें:",
  },
  evaluator_placeholder: {
    en: "Type feedback here or click a preset above...",
    hinglish: "Feedback yahan likhein ya upar ke buttons par click karein...",
    hi: "यहाँ टिप्पणी लिखें या ऊपर के बटनों पर क्लिक करें...",
  },
  evaluator_preset_1_label: {
    en: "👍 Well spoken!",
    hinglish: "👍 Bahut badhiya bola",
    hi: "👍 बहुत बढ़िया बोला",
  },
  evaluator_preset_1_text: {
    en: "Well spoken! Great confidence, clarity, and pacing.",
    hinglish: "Bahut badhiya bola! Confidence aur voice clarity bahut acchi rahi.",
    hi: "बहुत बढ़िया बोला! आत्मविश्वास और आवाज़ की स्पष्टता बहुत अच्छी रही।",
  },
  evaluator_preset_2_label: {
    en: "🔊 Speak louder",
    hinglish: "🔊 Aawaz thodi tez karein",
    hi: "🔊 आवाज़ थोड़ी तेज़ करें",
  },
  evaluator_preset_2_text: {
    en: "Your voice was slightly soft. Speak a bit louder and clearer next time.",
    hinglish: "Aawaz thodi dheemi thi, next time thoda tez aur saaf bolein.",
    hi: "आपकी आवाज़ थोड़ी धीमी थी, अगली बार थोड़ा तेज़ और स्पष्ट बोलें।",
  },
  evaluator_preset_3_label: {
    en: "⏱️ Pace yourself",
    hinglish: "⏱️ Dheere bolein",
    hi: "⏱️ धीरे बोलें",
  },
  evaluator_preset_3_text: {
    en: "Take your time. Pause naturally between thoughts instead of rushing.",
    hinglish: "Jaldbazi na karein, words ke beech thoda ruk kar aaram se bolein.",
    hi: "जल्दबाज़ी न करें, विचारों के बीच थोड़ा रुककर आराम से बोलें।",
  },
  evaluator_preset_4_label: {
    en: "🗣️ Reduce fillers",
    hinglish: "🗣️ 'Umm' kam bolein",
    hi: "🗣️ 'Umm' कम बोलें",
  },
  evaluator_preset_4_text: {
    en: "Try to avoid filler words like 'umm' and 'aah'. Take a silent breath instead.",
    hinglish: "'Umm' ya 'aah' kam bolein, sochne ke liye quiet pause lein.",
    hi: "बोलते समय 'umm' या 'aah' कम बोलें, सोचने के लिए शांत विराम लें।",
  },
  evaluator_preset_5_label: {
    en: "⭐ Daily practice",
    hinglish: "⭐ Roz practice karein",
    hi: "⭐ रोज़ाना अभ्यास करें",
  },
  evaluator_preset_5_text: {
    en: "Good start! Recording 1 drill every day will quickly build your spoken fluency.",
    hinglish: "Acchi shuruat! Roz 1 practice record karne se bolne ki jhijhak khatam hogi.",
    hi: "अच्छी शुरुआत! रोज़ 1 अभ्यास रिकॉर्ड करने से बोलने की झिझक खत्म होगी।",
  },

  // Parent Report Card Keys
  report_weekly_title: {
    en: "Weekly Progress Report",
    hinglish: "Weekly Progress Report",
    hi: "साप्ताहिक प्रगति रिपोर्ट",
  },
  report_student_label: {
    en: "Student",
    hinglish: "Student",
    hi: "विद्यार्थी",
  },
  report_speech_clear: {
    en: "Clear Speech",
    hinglish: "Clear Speech",
    hi: "स्पष्ट आवाज़",
  },
  report_speech_filler: {
    en: "Fillers",
    hinglish: "Fillers",
    hi: "अटकना",
  },
  report_speech_pause: {
    en: "Pauses",
    hinglish: "Pauses",
    hi: "ठहराव",
  },
  report_score_pron: {
    en: "Pronunciation",
    hinglish: "Pronunciation",
    hi: "उच्चारण",
  },
  report_score_vocab: {
    en: "Vocabulary",
    hinglish: "Vocabulary",
    hi: "शब्द ज्ञान",
  },
  report_score_gram: {
    en: "Grammar",
    hinglish: "Grammar",
    hi: "व्याकरण",
  },
  report_official_tag: {
    en: "Trounce Spoken English Institute · Official Progress Card",
    hinglish: "Trounce Spoken English Institute · Official Progress Card",
    hi: "Trounce Spoken English Institute · आधिकारिक प्रगति कार्ड",
  },
  report_summary_active: {
    en: "{name} completed {count} speaking practice session(s) this week. {trend}",
    hinglish: "{name} ne is hafte {count} baar bolkar practice poora kiya. {trend}",
    hi: "{name} ने इस हफ्ते {count} बार बोलकर अभ्यास पूरा किया। {trend}",
  },
  report_summary_zero: {
    en: "{name} has not practiced this week yet. Please encourage daily practice.",
    hinglish:
      "{name} ne is hafte abhi tak practice nahi kiya. Kripya daily practice ke liye kahein.",
    hi: "{name} ने इस हफ्ते अभ्यास नहीं किया है। कृपया नियमित अभ्यास के लिए प्रेरित करें।",
  },

  // WhatsApp Reports Page
  whatsapp_lang_label: {
    en: "WhatsApp Message Language:",
    hinglish: "WhatsApp Message Language:",
    hi: "व्हाट्सएप संदेश भाषा:",
  },
  share_on_whatsapp_btn: {
    en: "Share on WhatsApp ➜",
    hinglish: "WhatsApp par Share Karein ➜",
    hi: "व्हाट्सएप पर शेयर करें ➜",
  },
} as const;

export type TranslationKey = keyof typeof translations;

/**
 * Returns stored user language preference, default is 'en'
 */
export function getStoredLanguage(): Language {
  if (typeof window === "undefined") return "en";
  try {
    const val = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (val === "en" || val === "hinglish" || val === "hi") {
      return val;
    }
    return "en";
  } catch {
    return "en";
  }
}

/**
 * Saves language preference and broadcasts event
 */
export function setStoredLanguage(lang: Language) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: { lang } }));
  } catch {
    // Ignore storage errors in private browsing / restricted contexts
  }
}

/**
 * React hook to read, observe, and switch language
 */
export function useLanguage() {
  const [lang, setLangState] = useState<Language>(() => getStoredLanguage());

  useEffect(() => {
    const handleLangChange = (e: Event) => {
      let next = getStoredLanguage();
      if (e instanceof CustomEvent && e.detail?.lang) {
        next = e.detail.lang;
      }
      setLangState(next);
    };

    window.addEventListener(LANGUAGE_EVENT, handleLangChange);
    window.addEventListener("storage", handleLangChange);
    return () => {
      window.removeEventListener(LANGUAGE_EVENT, handleLangChange);
      window.removeEventListener("storage", handleLangChange);
    };
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLangState(next);
    setStoredLanguage(next);
  }, []);

  /**
   * Translate key with variable interpolation (e.g. {name}, {count})
   */
  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      const entry = translations[key];
      if (!entry) return String(key);
      let text: string = entry[lang] || entry.en || String(key);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return text;
    },
    [lang],
  );

  return {
    lang,
    setLanguage,
    t,
  };
}
