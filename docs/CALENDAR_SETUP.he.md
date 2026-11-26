# חיבור יומן Google

הקוד לקריאת היומן מוכן והוא **כבוי**, עד שתשלימי את ההגדרה הזו. ההרשאה היא לקריאה בלבד, ולא נשלחים אל המערכת כותרות, מיקומים או משתתפים: רק שעות.

## העיקרון

```
את מאשרת פעם אחת ל-Google  ──>  מתקבל "אסימון רענון"  ──>  נשמר כסוד ב-GitHub
                                                                  │
כל שעה: GitHub קורא את היומן שלך ──> שומר רק שעות תפוס ב-Supabase ──> האפליקציה מחשבת שעות פנויות
```

## מה צריך להכין (פעם אחת, כ-15 דקות)

### 1. ליצור פרויקט ב-Google Cloud
1. להיכנס ל-[console.cloud.google.com](https://console.cloud.google.com) עם חשבון ה-Google של היומן.
2. למעלה: בחירת פרויקט ← **פרויקט חדש**, שם: `student-copilot`.

### 2. להפעיל את Calendar API
1. תפריט ← **APIs & Services** ← **Library**.
2. לחפש **Google Calendar API** ← **Enable**.

### 3. מסך הסכמה
1. **APIs & Services** ← **OAuth consent screen** (או Google Auth Platform).
2. סוג: **External**. שם האפליקציה: `student-copilot`. מייל תמיכה: המייל שלך.
3. להוסיף את עצמך כ-**Test user**.
4. **החלטה (ADR 0002):** במצב Testing האישור פג אחרי 7 ימים. אם לא רוצה להתחבר מחדש כל שבוע, ללחוץ **Publish app** ל-Production. כשהאפליקציה היא רק שלך זה אפשרי בלי אימות, ו-Google תציג אזהרה "האפליקציה לא מאומתת" שאפשר להמשיך אחריה.

### 4. ליצור מפתחות
1. **Credentials** ← **Create credentials** ← **OAuth client ID**.
2. סוג: **Desktop app**. שם: `student-copilot`.
3. לשמור את שני הערכים: **Client ID** ו-**Client secret**.

## להכניס את המפתחות לפרויקט

הסודות לא עוברים בשיחה. הפקודה פותחת דף מקומי, ואת מדביקה בו את הערך. מריצים כל פקודה בנפרד:

```powershell
node tools/set-secret.js GOOGLE_CLIENT_ID
```

```powershell
node tools/set-secret.js GOOGLE_CLIENT_SECRET
```

אם `GOOGLE_CLIENT_ID` עוד לא קיים בקובץ `automations/.env`, להוסיף אליו שורה ריקה `GOOGLE_CLIENT_ID=` ו-`GOOGLE_CLIENT_SECRET=` ידנית לפני כן.

## להתחבר

```powershell
node tools/google-auth.js
```

ייפתח דפדפן. לבחור את החשבון, ולאשר "ראיית אירועים ביומן" (קריאה בלבד). בסוף הטרמינל יציג `GOOGLE_REFRESH_TOKEN נשמר`. האסימון לא מוצג ולא מועבר לשום מקום, והוא נכתב ל-`automations/.env`.

## להעביר ל-GitHub

ב-GitHub: **Settings** ← **Secrets and variables** ← **Actions** ← **New repository secret**, שלוש פעמים, עם הערכים מ-`automations/.env`:

| שם | מאיפה |
| --- | --- |
| `GOOGLE_CLIENT_ID` | מהקובץ |
| `GOOGLE_CLIENT_SECRET` | מהקובץ |
| `GOOGLE_REFRESH_TOKEN` | מהקובץ |

ברגע שקיים `GOOGLE_REFRESH_TOKEN`, הסנכרון מתחיל לרוץ כל שעה, בין 07:00 ל-22:00.

## להפעיל בצד Supabase

להריץ מחדש את `supabase/schema.sql` ב-SQL Editor. הוא בטוח להרצה חוזרת, ומוסיף את הטבלה `calendar_busy`.

## לבדוק

1. ב-GitHub: Actions ← automations ← **Run workflow** ← `5-calendar-sync`.
2. ב-SQL Editor: `select * from public.calendar_busy order by date;`. אמורות להופיע שעות של האירועים שלך ב-14 הימים הקרובים.
3. באפליקציה: כשיש אירוע היום, "פנויות היום" יורד בהתאם.

## מה קורה כשמשהו משתבש

| מצב | מה האפליקציה עושה |
| --- | --- |
| הסנכרון נכשל או ישן מ-3 שעות | מתעלמת מהיומן וחוזרת להנחה הקודמת, ומציגה אזהרה |
| האישור של Google פג | הסנכרון נכשל בהודעה "האישור פג", ויש לחזור על `node tools/google-auth.js` ולעדכן את הסוד ב-GitHub |
| אירוע של יום שלם | לא נספר |
| אירוע שמסומן "פנוי" או בוטל | לא נספר |
| אירוע שמשקף הרצאה מוקלטת או זום | לא נספר, כי אפשר לצפות בה בכל שעה |

## ביטול

למחוק את הסוד `GOOGLE_REFRESH_TOKEN` ב-GitHub והסנכרון נעצר. אפשר גם לבטל את ההרשאה ב-[myaccount.google.com/permissions](https://myaccount.google.com/permissions).
