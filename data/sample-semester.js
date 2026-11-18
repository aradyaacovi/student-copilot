// נתוני הדגמה – עולים לגיטהאב. הנתונים האמיתיים נמצאים ב-data/my-semester.js (לא עולה).
// להתחלה: להעתיק את הקובץ הזה ל-data/my-semester.js ולשנות את SAMPLE_DATA ל-SEMESTER_DATA.
// demoState משמש רק במצב ?demo=1 (צילומי מסך והאתר הציבורי).
window.SAMPLE_DATA = {
  "student": {
    "name": "נועה (הדגמה)",
    "program": "הנדסת תעשייה וניהול"
  },
  "updated": "2026-11-01",
  "semester": {
    "name": "סמסטר לדוגמה",
    "start": "2026-10-18",
    "end": "2027-01-15",
    "noStudyDates": [
      "2026-10-27"
    ],
    "examPeriod": {
      "start": "2027-01-17",
      "end": "2027-02-28"
    },
    "dayEnd": "19:30"
  },
  "previous": {
    "credits": 60,
    "average": 85
  },
  "courses": [
    {
      "id": "stats",
      "name": "סטטיסטיקה",
      "short": "סטטיסטיקה",
      "code": "000-1-0001",
      "credits": 4,
      "color": "#00c875",
      "components": [
        {
          "key": "hw",
          "name": "תרגילי בית",
          "weight": 10,
          "type": "hw"
        },
        {
          "key": "exam",
          "name": "מבחן",
          "weight": 90,
          "type": "exam"
        }
      ],
      "conditions": [
        "56 לפחות במבחן"
      ],
      "staff": [
        "מרצה לדוגמה"
      ],
      "links": [],
      "notes": [],
      "sessions": [
        {
          "type": "lecture",
          "day": 0,
          "start": "10:00",
          "end": "12:00",
          "from": "2026-10-18",
          "location": "בניין 1, חדר 101",
          "cancelled": [
            "2026-11-08"
          ]
        },
        {
          "type": "tutorial",
          "day": 2,
          "start": "12:00",
          "end": "13:00",
          "from": "2026-10-20",
          "location": "בניין 2, חדר 202",
          "extra": [
            {
              "date": "2026-11-12",
              "start": "16:00",
              "end": "17:00",
              "note": "השלמה בזום"
            }
          ]
        }
      ],
      "summaries": [
        {
          "session": "הרצאה 1",
          "title": "מבוא",
          "points": [
            "משתנה מקרי",
            "תוחלת ושונות"
          ]
        },
        {
          "session": "הרצאה 2",
          "title": "התפלגויות רציפות",
          "points": [
            "נורמלית ותקנון",
            "מעריכית וחוסר זיכרון",
            "מלכודת: צפיפות אינה הסתברות"
          ]
        }
      ]
    },
    {
      "id": "ops",
      "name": "חקר ביצועים",
      "short": "חק״ב",
      "code": "000-1-0002",
      "credits": 3.5,
      "color": "#a25ddc",
      "components": [
        {
          "key": "project",
          "name": "פרויקט",
          "weight": 30,
          "type": "project",
          "min": 56
        },
        {
          "key": "exam",
          "name": "מבחן",
          "weight": 70,
          "type": "exam"
        }
      ],
      "conditions": [
        "56 לפחות גם בפרויקט"
      ],
      "staff": [],
      "links": [],
      "notes": [],
      "sessions": [
        {
          "type": "lecture",
          "day": 1,
          "start": "14:00",
          "end": "17:00",
          "from": "2026-10-19",
          "recorded": true,
          "location": "מוקלט"
        }
      ],
      "summaries": []
    },
    {
      "id": "algo",
      "name": "אלגוריתמים",
      "short": "אלגו",
      "code": "000-1-0004",
      "credits": 4,
      "color": "#0073ea",
      "components": [
        {
          "key": "hw",
          "name": "תרגילי בית",
          "weight": 15,
          "type": "hw"
        },
        {
          "key": "quiz",
          "name": "בוחן אמצע",
          "weight": 15,
          "type": "quiz"
        },
        {
          "key": "exam",
          "name": "מבחן",
          "weight": 70,
          "type": "exam"
        }
      ],
      "conditions": [
        "56 לפחות במבחן",
        "5 תרגילים, הגרוע לא נספר"
      ],
      "staff": [
        "מרצה לדוגמה",
        "מתרגל לדוגמה (קב׳ 3)"
      ],
      "links": [],
      "notes": [
        "תרגילים בזוגות."
      ],
      "sessions": [
        {
          "type": "lecture",
          "day": 2,
          "start": "09:00",
          "end": "12:00",
          "from": "2026-10-20",
          "location": "בניין 3, חדר 110"
        },
        {
          "type": "tutorial",
          "day": 3,
          "start": "10:00",
          "end": "12:00",
          "from": "2026-10-21",
          "location": "בניין 3, חדר 204"
        }
      ],
      "summaries": [
        {
          "session": "הרצאה 3",
          "title": "הפרד ומשול",
          "points": [
            "משפט המאסטר",
            "מיון מיזוג",
            "בחירה בזמן לינארי"
          ]
        }
      ]
    },
    {
      "id": "econ",
      "name": "כלכלה הנדסית",
      "short": "כלכלה",
      "code": "000-1-0005",
      "credits": 3,
      "color": "#e2445c",
      "components": [
        {
          "key": "part",
          "name": "השתתפות",
          "weight": 10,
          "type": "participation"
        },
        {
          "key": "project",
          "name": "עבודה מסכמת",
          "weight": 30,
          "type": "project"
        },
        {
          "key": "exam",
          "name": "מבחן",
          "weight": 60,
          "type": "exam"
        }
      ],
      "conditions": [
        "נוכחות חובה ב-80% מהמפגשים"
      ],
      "staff": [
        "מרצה לדוגמה"
      ],
      "links": [],
      "notes": [],
      "sessions": [
        {
          "type": "lecture",
          "day": 3,
          "start": "14:00",
          "end": "17:00",
          "from": "2026-10-21",
          "location": "בניין 5, חדר 12"
        }
      ],
      "summaries": []
    },
    {
      "id": "ws",
      "name": "סדנה",
      "short": "סדנה",
      "code": "000-1-0003",
      "credits": 0.5,
      "color": "#00a9a5",
      "components": [],
      "conditions": [],
      "staff": [],
      "links": [],
      "notes": [],
      "sessions": [
        {
          "type": "workshop",
          "day": 4,
          "start": "09:00",
          "end": "12:00",
          "from": "2026-12-10",
          "count": 4,
          "location": "חדר לא ידוע"
        }
      ],
      "summaries": []
    }
  ],
  "deadlines": [
    {
      "date": "2026-11-18",
      "time": "23:55",
      "courseId": "algo",
      "title": "תרגיל בית 2",
      "weight": 3,
      "kind": "submission"
    },
    {
      "date": "2026-11-20",
      "time": "23:55",
      "courseId": "stats",
      "title": "תרגיל בית 3",
      "weight": 2,
      "kind": "submission"
    },
    {
      "date": "2026-11-26",
      "courseId": "algo",
      "title": "בוחן אמצע",
      "weight": 15,
      "kind": "quiz"
    },
    {
      "date": "2026-12-03",
      "time": "23:55",
      "courseId": "econ",
      "title": "עבודה מסכמת – הצעה",
      "weight": 10,
      "kind": "submission"
    },
    {
      "date": "2026-12-15",
      "time": "23:55",
      "courseId": "ops",
      "title": "פרויקט",
      "weight": 30,
      "kind": "submission"
    },
    {
      "date": "2026-12-24",
      "time": "23:55",
      "courseId": "econ",
      "title": "עבודה מסכמת",
      "weight": 20,
      "kind": "submission"
    },
    {
      "date": "2027-01-20",
      "courseId": "stats",
      "title": "מבחן מועד א׳",
      "weight": 90,
      "kind": "exam"
    },
    {
      "date": "2027-01-24",
      "courseId": "algo",
      "title": "מבחן מועד א׳",
      "weight": 70,
      "kind": "exam"
    },
    {
      "date": "2027-01-27",
      "courseId": "ops",
      "title": "מבחן מועד א׳",
      "weight": 70,
      "kind": "exam"
    },
    {
      "date": "2027-02-02",
      "courseId": "econ",
      "title": "מבחן מועד א׳",
      "weight": 60,
      "kind": "exam"
    }
  ],
  "undated": [],
  "openItems": [
    {
      "id": "ops-team",
      "text": "לסגור צוות לפרויקט",
      "courseId": "ops"
    },
    {
      "id": "econ-topic",
      "text": "לבחור נושא לעבודה המסכמת",
      "courseId": "econ"
    }
  ],
  "rules": [
    "כל שיעור בקמפוס כולל בניין וחדר.",
    "קודם הרצאה, אחריה התרגול.",
    "ימי לימודים מסתיימים עד 19:30."
  ],
  "demoState": {
    "seen": {
      "stats|lecture|1": true,
      "stats|lecture|2": true,
      "stats|lecture|3": true,
      "stats|tutorial|1": true,
      "stats|tutorial|2": true,
      "stats|tutorial|3": true,
      "algo|lecture|1": true,
      "algo|lecture|2": true,
      "algo|lecture|3": true,
      "algo|tutorial|1": true,
      "algo|tutorial|2": true,
      "ops|lecture|1": true,
      "ops|lecture|2": true,
      "econ|lecture|1": true,
      "econ|lecture|2": true,
      "econ|lecture|3": true
    },
    "grades": {
      "stats": {
        "components": {
          "hw": 92
        }
      },
      "algo": {
        "components": {
          "hw": 88
        }
      },
      "econ": {
        "components": {
          "part": 100
        }
      }
    }
  }
};
