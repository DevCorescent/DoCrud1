/**
 * Reading a form that is not in English.
 *
 * ═══ WHY THIS HAD TO EXIST ═══
 *
 * `normalize()` in field-map.ts strips everything outside `[a-zA-Z0-9+ ]`, for
 * the good reason that punctuation and case carry no meaning in a field name.
 * The side effect was total: a label reading "पहला नाम" normalised to the EMPTY
 * STRING. Not "matched the wrong rule" — matched nothing, scored nothing, and
 * the field came back unfillable with no indication why. Every form in Hindi,
 * Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam or Punjabi was
 * invisible to this feature.
 *
 * So the raw text is translated to English BEFORE it is normalised, and
 * everything downstream — the rules, the synonyms, the option chooser — goes on
 * working in one language.
 *
 * ═══ WHY A TABLE AND NOT A MODEL ═══
 *
 * The model pass in apply-resolve.ts already handles arbitrary text when there
 * is a key configured. This runs first, for free, offline, deterministically,
 * and in the common case it is enough: form labels are a tiny closed
 * vocabulary — name, email, phone, city, salary, notice period — repeated
 * across every form ever built. A table of the words that actually appear
 * covers the overwhelming majority, and covers it the same way every time.
 *
 * ═══ WHAT MAKES A SAFE ENTRY ═══
 *
 * Every English target here is a phrase that already appears in RULES, because
 * a translation landing on a phrase the matcher does not know is a no-op that
 * looks like a feature. The selftest asserts exactly that.
 *
 * Non-Latin phrases are matched as substrings: the Indic scripts write
 * compounds without spaces and glue postpositions to the noun, so word
 * boundaries would miss most real labels.
 *
 * Latin-script phrases are matched as WHOLE WORDS ONLY, and are restricted to
 * terms that cannot occur in an English form. This is the entire risk surface
 * of the file: "Land" means country in German and nothing in an English form,
 * so it is safe; "name" means the same in three languages and is therefore
 * absent, because translating it would be a no-op at best and a regression at
 * worst. When in doubt the term is left out — a missing translation costs one
 * field, a wrong one puts someone's salary in the wrong box.
 *
 * PURE. No clock, no storage, no network.
 */

/** [what a form says, what our vocabulary calls it] */
type Entry = readonly [string, string];

/* ── Devanagari: Hindi and Marathi ───────────────────────────────────── */
const HI: readonly Entry[] = [
  ['पहला नाम', 'first name'], ['प्रथम नाम', 'first name'], ['पहिले नाव', 'first name'],
  ['अंतिम नाम', 'last name'], ['उपनाम', 'last name'], ['आडनाव', 'last name'],
  ['पूरा नाम', 'full name'], ['पूर्ण नाव', 'full name'], ['नाम', 'full name'], ['नाव', 'full name'],
  ['ईमेल', 'email'], ['ई मेल', 'email'], ['इलेक्ट्रॉनिक मेल', 'email'],
  ['मोबाइल', 'mobile'], ['मोबाईल', 'mobile'], ['फ़ोन', 'phone'], ['फोन', 'phone'],
  ['दूरभाष', 'phone'], ['संपर्क नंबर', 'contact number'],
  ['पता', 'address'], ['शहर', 'city'], ['नगर', 'city'], ['राज्य', 'state'],
  ['देश', 'country'], ['पिन कोड', 'pin code'], ['डाक कोड', 'postal code'],
  ['स्थान', 'location'], ['निवास', 'location'],
  ['वर्तमान पद', 'current title'], ['पदनाम', 'designation'], ['पद', 'designation'],
  ['वर्तमान कंपनी', 'current company'], ['कंपनी', 'company'], ['नियोक्ता', 'employer'],
  ['संस्था', 'organisation'], ['संस्थान', 'institution'],
  ['कुल अनुभव', 'total experience'], ['अनुभव के वर्ष', 'years of experience'],
  ['वर्षों का अनुभव', 'years of experience'], ['अनुभव', 'total experience'],
  ['विद्यालय', 'school'], ['विश्वविद्यालय', 'university'], ['महाविद्यालय', 'college'],
  ['शिक्षा', 'degree'], ['योग्यता', 'qualification'], ['डिग्री', 'degree'],
  ['उत्तीर्ण वर्ष', 'passing year'], ['स्नातक वर्ष', 'graduation year'],
  ['विशेषज्ञता', 'specialisation'], ['शाखा', 'branch'],
  ['वर्तमान वेतन', 'current salary'], ['अपेक्षित वेतन', 'expected salary'],
  ['वांछित वेतन', 'desired salary'], ['वेतन', 'salary'], ['पगार', 'salary'],
  ['नोटिस अवधि', 'notice period'], ['सूचना अवधि', 'notice period'],
  ['कब शामिल हो सकते', 'how soon can you join'], ['प्रारंभ तिथि', 'start date'],
  ['उपलब्धता', 'availability to start'],
  ['स्थानांतरण', 'relocate'], ['स्थानांतरित', 'relocate'],
  ['कार्य अनुमति', 'work permit'], ['काम करने की अनुमति', 'work permit'],
  ['वीज़ा प्रायोजन', 'visa sponsorship'], ['प्रायोजन', 'sponsorship'],
  ['रेज़्यूमे', 'resume'], ['रिज्यूमे', 'resume'], ['बायोडाटा', 'resume'],
  ['कवर लेटर', 'cover letter'], ['आवेदन पत्र', 'cover letter'],
  ['आपको कैसे पता चला', 'how did you hear'], ['स्रोत', 'source'],
  ['वेबसाइट', 'website'], ['पोर्टफोलियो', 'portfolio'],
  /* Options, so `chooseOption` has something to pick from. */
  ['हाँ', 'yes'], ['हां', 'yes'], ['होय', 'yes'], ['नहीं', 'no'], ['नाही', 'no'],
  ['तुरंत', 'immediately'], ['तत्काल', 'immediately'],
  ['महीने', 'months'], ['महीना', 'month'],
  ['दिन', 'days'], ['सप्ताह', 'weeks'], ['वर्ष', 'years'], ['साल', 'years'],
];

/* ── Bengali ─────────────────────────────────────────────────────────── */
const BN: readonly Entry[] = [
  ['প্রথম নাম', 'first name'], ['পদবি', 'last name'], ['শেষ নাম', 'last name'],
  ['পুরো নাম', 'full name'], ['নাম', 'full name'],
  ['ইমেইল', 'email'], ['ই মেইল', 'email'], ['ইমেল', 'email'],
  ['মোবাইল', 'mobile'], ['ফোন', 'phone'], ['যোগাযোগ নম্বর', 'contact number'],
  ['ঠিকানা', 'address'], ['শহর', 'city'], ['রাজ্য', 'state'], ['দেশ', 'country'],
  ['পিন কোড', 'pin code'], ['অবস্থান', 'location'],
  ['বর্তমান পদ', 'current title'], ['পদ', 'designation'],
  ['বর্তমান কোম্পানি', 'current company'], ['কোম্পানি', 'company'], ['প্রতিষ্ঠান', 'organisation'],
  ['মোট অভিজ্ঞতা', 'total experience'], ['অভিজ্ঞতা', 'total experience'],
  ['বিদ্যালয়', 'school'], ['বিশ্ববিদ্যালয়', 'university'], ['কলেজ', 'college'],
  ['ডিগ্রি', 'degree'], ['যোগ্যতা', 'qualification'], ['পাশের বছর', 'passing year'],
  ['বর্তমান বেতন', 'current salary'], ['প্রত্যাশিত বেতন', 'expected salary'], ['বেতন', 'salary'],
  ['নোটিশ পিরিয়ড', 'notice period'], ['কবে যোগ দিতে পারবেন', 'how soon can you join'],
  ['শুরুর তারিখ', 'start date'], ['স্থানান্তর', 'relocate'],
  ['কাজের অনুমতি', 'work permit'], ['ভিসা স্পনসরশিপ', 'visa sponsorship'],
  ['জীবনবৃত্তান্ত', 'resume'], ['রিজিউমে', 'resume'], ['কভার লেটার', 'cover letter'],
  ['ওয়েবসাইট', 'website'],
  ['হ্যাঁ', 'yes'], ['না', 'no'], ['অবিলম্বে', 'immediately'],
  ['মাস', 'months'], ['দিন', 'days'],
];

/* ── Tamil ───────────────────────────────────────────────────────────── */
const TA: readonly Entry[] = [
  ['முதல் பெயர்', 'first name'], ['கடைசி பெயர்', 'last name'], ['குடும்பப் பெயர்', 'family name'],
  ['முழுப் பெயர்', 'full name'], ['பெயர்', 'full name'],
  ['மின்னஞ்சல்', 'email'], ['அலைபேசி', 'mobile'], ['தொலைபேசி', 'phone'],
  ['தொடர்பு எண்', 'contact number'],
  ['முகவரி', 'address'], ['நகரம்', 'city'], ['மாநிலம்', 'state'], ['நாடு', 'country'],
  ['அஞ்சல் குறியீடு', 'postal code'], ['இடம்', 'location'],
  ['தற்போதைய பதவி', 'current title'], ['பதவி', 'designation'],
  ['தற்போதைய நிறுவனம்', 'current company'], ['நிறுவனம்', 'company'],
  ['மொத்த அனுபவம்', 'total experience'], ['அனுபவம்', 'total experience'],
  ['பள்ளி', 'school'], ['பல்கலைக்கழகம்', 'university'], ['கல்லூரி', 'college'],
  ['பட்டம்', 'degree'], ['தகுதி', 'qualification'], ['தேர்ச்சி ஆண்டு', 'passing year'],
  ['தற்போதைய சம்பளம்', 'current salary'], ['எதிர்பார்க்கும் சம்பளம்', 'expected salary'],
  ['சம்பளம்', 'salary'],
  ['நோட்டீஸ் காலம்', 'notice period'], ['தொடங்கும் தேதி', 'start date'],
  ['இடமாற்றம்', 'relocate'], ['பணி அனுமதி', 'work permit'],
  ['விசா ஸ்பான்சர்ஷிப்', 'visa sponsorship'],
  ['சுயவிவரம்', 'resume'], ['ரெஸ்யூம்', 'resume'], ['கவர் லெட்டர்', 'cover letter'],
  ['இணையதளம்', 'website'],
  ['ஆம்', 'yes'], ['இல்லை', 'no'], ['உடனடியாக', 'immediately'],
  ['மாதம்', 'month'], ['நாட்கள்', 'days'],
];

/* ── Telugu ──────────────────────────────────────────────────────────── */
const TE: readonly Entry[] = [
  ['మొదటి పేరు', 'first name'], ['చివరి పేరు', 'last name'], ['ఇంటి పేరు', 'family name'],
  ['పూర్తి పేరు', 'full name'], ['పేరు', 'full name'],
  ['ఇమెయిల్', 'email'], ['మొబైల్', 'mobile'], ['ఫోన్', 'phone'],
  ['సంప్రదింపు నంబర్', 'contact number'],
  ['చిరునామా', 'address'], ['నగరం', 'city'], ['రాష్ట్రం', 'state'], ['దేశం', 'country'],
  ['పిన్ కోడ్', 'pin code'], ['ప్రదేశం', 'location'],
  ['ప్రస్తుత హోదా', 'current title'], ['హోదా', 'designation'],
  ['ప్రస్తుత కంపెనీ', 'current company'], ['కంపెనీ', 'company'], ['సంస్థ', 'organisation'],
  ['మొత్తం అనుభవం', 'total experience'], ['అనుభవం', 'total experience'],
  ['పాఠశాల', 'school'], ['విశ్వవిద్యాలయం', 'university'], ['కళాశాల', 'college'],
  ['డిగ్రీ', 'degree'], ['అర్హత', 'qualification'], ['ఉత్తీర్ణ సంవత్సరం', 'passing year'],
  ['ప్రస్తుత జీతం', 'current salary'], ['ఆశించిన జీతం', 'expected salary'], ['జీతం', 'salary'],
  ['నోటీసు వ్యవధి', 'notice period'], ['ప్రారంభ తేదీ', 'start date'],
  ['బదిలీ', 'relocate'], ['పని అనుమతి', 'work permit'],
  ['రెజ్యూమె', 'resume'], ['కవర్ లెటర్', 'cover letter'],
  ['అవును', 'yes'], ['కాదు', 'no'], ['వెంటనే', 'immediately'],
  ['నెల', 'month'], ['రోజులు', 'days'],
];

/* ── Gujarati ────────────────────────────────────────────────────────── */
const GU: readonly Entry[] = [
  ['પહેલું નામ', 'first name'], ['છેલ્લું નામ', 'last name'], ['અટક', 'surname'],
  ['પૂરું નામ', 'full name'], ['નામ', 'full name'],
  ['ઈમેલ', 'email'], ['મોબાઈલ', 'mobile'], ['ફોન', 'phone'],
  ['સરનામું', 'address'], ['શહેર', 'city'], ['રાજ્ય', 'state'], ['દેશ', 'country'],
  ['પિન કોડ', 'pin code'], ['સ્થળ', 'location'],
  ['હાલનું પદ', 'current title'], ['પદ', 'designation'],
  ['હાલની કંપની', 'current company'], ['કંપની', 'company'],
  ['કુલ અનુભવ', 'total experience'], ['અનુભવ', 'total experience'],
  ['શાળા', 'school'], ['યુનિવર્સિટી', 'university'], ['કોલેજ', 'college'],
  ['ડિગ્રી', 'degree'], ['લાયકાત', 'qualification'], ['પાસ વર્ષ', 'passing year'],
  ['હાલનો પગાર', 'current salary'], ['અપેક્ષિત પગાર', 'expected salary'], ['પગાર', 'salary'],
  ['નોટિસ પિરિયડ', 'notice period'], ['શરૂઆતની તારીખ', 'start date'],
  ['સ્થળાંતર', 'relocate'], ['કામની પરવાનગી', 'work permit'],
  ['રેઝ્યુમે', 'resume'], ['કવર લેટર', 'cover letter'],
  ['હા', 'yes'], ['ના', 'no'], ['તરત', 'immediately'],
  ['મહિનો', 'month'], ['દિવસ', 'days'],
];

/* ── Kannada ─────────────────────────────────────────────────────────── */
const KN: readonly Entry[] = [
  ['ಮೊದಲ ಹೆಸರು', 'first name'], ['ಕೊನೆಯ ಹೆಸರು', 'last name'], ['ಪೂರ್ಣ ಹೆಸರು', 'full name'],
  ['ಹೆಸರು', 'full name'],
  ['ಇಮೇಲ್', 'email'], ['ಮೊಬೈಲ್', 'mobile'], ['ದೂರವಾಣಿ', 'phone'], ['ಫೋನ್', 'phone'],
  ['ವಿಳಾಸ', 'address'], ['ನಗರ', 'city'], ['ರಾಜ್ಯ', 'state'], ['ದೇಶ', 'country'],
  ['ಪಿನ್ ಕೋಡ್', 'pin code'], ['ಸ್ಥಳ', 'location'],
  ['ಪ್ರಸ್ತುತ ಹುದ್ದೆ', 'current title'], ['ಹುದ್ದೆ', 'designation'],
  ['ಪ್ರಸ್ತುತ ಕಂಪನಿ', 'current company'], ['ಕಂಪನಿ', 'company'], ['ಸಂಸ್ಥೆ', 'organisation'],
  ['ಒಟ್ಟು ಅನುಭವ', 'total experience'], ['ಅನುಭವ', 'total experience'],
  ['ಶಾಲೆ', 'school'], ['ವಿಶ್ವವಿದ್ಯಾಲಯ', 'university'], ['ಕಾಲೇಜು', 'college'],
  ['ಪದವಿ', 'degree'], ['ಅರ್ಹತೆ', 'qualification'], ['ಉತ್ತೀರ್ಣ ವರ್ಷ', 'passing year'],
  ['ಪ್ರಸ್ತುತ ಸಂಬಳ', 'current salary'], ['ನಿರೀಕ್ಷಿತ ಸಂಬಳ', 'expected salary'], ['ಸಂಬಳ', 'salary'],
  ['ನೋಟಿಸ್ ಅವಧಿ', 'notice period'], ['ಪ್ರಾರಂಭ ದಿನಾಂಕ', 'start date'],
  ['ಸ್ಥಳಾಂತರ', 'relocate'], ['ಕೆಲಸದ ಅನುಮತಿ', 'work permit'],
  ['ರೆಸ್ಯೂಮ್', 'resume'], ['ಕವರ್ ಲೆಟರ್', 'cover letter'],
  ['ಹೌದು', 'yes'], ['ಇಲ್ಲ', 'no'], ['ತಕ್ಷಣ', 'immediately'],
  ['ತಿಂಗಳು', 'month'], ['ದಿನಗಳು', 'days'],
];

/* ── Malayalam ───────────────────────────────────────────────────────── */
const ML: readonly Entry[] = [
  ['ആദ്യ പേര്', 'first name'], ['അവസാന പേര്', 'last name'], ['മുഴുവൻ പേര്', 'full name'],
  ['പേര്', 'full name'],
  ['ഇമെയിൽ', 'email'], ['മൊബൈൽ', 'mobile'], ['ഫോൺ', 'phone'],
  ['വിലാസം', 'address'], ['നഗരം', 'city'], ['സംസ്ഥാനം', 'state'], ['രാജ്യം', 'country'],
  ['പിൻ കോഡ്', 'pin code'], ['സ്ഥലം', 'location'],
  ['നിലവിലെ തസ്തിക', 'current title'], ['തസ്തിക', 'designation'],
  ['നിലവിലെ കമ്പനി', 'current company'], ['കമ്പനി', 'company'], ['സ്ഥാപനം', 'organisation'],
  ['ആകെ പരിചയം', 'total experience'], ['പരിചയം', 'total experience'],
  ['സ്കൂൾ', 'school'], ['സർവകലാശാല', 'university'], ['കോളേജ്', 'college'],
  ['ബിരുദം', 'degree'], ['യോഗ്യത', 'qualification'], ['വിജയ വർഷം', 'passing year'],
  ['നിലവിലെ ശമ്പളം', 'current salary'], ['പ്രതീക്ഷിക്കുന്ന ശമ്പളം', 'expected salary'],
  ['ശമ്പളം', 'salary'],
  ['നോട്ടീസ് പിരീഡ്', 'notice period'], ['ആരംഭ തീയതി', 'start date'],
  ['സ്ഥലംമാറ്റം', 'relocate'], ['ജോലി അനുമതി', 'work permit'],
  ['റെസ്യൂമെ', 'resume'], ['കവർ ലെറ്റർ', 'cover letter'],
  ['അതെ', 'yes'], ['അല്ല', 'no'], ['ഉടൻ', 'immediately'],
  ['മാസം', 'month'], ['ദിവസം', 'days'],
];

/* ── Punjabi ─────────────────────────────────────────────────────────── */
const PA: readonly Entry[] = [
  ['ਪਹਿਲਾ ਨਾਮ', 'first name'], ['ਆਖਰੀ ਨਾਮ', 'last name'], ['ਪੂਰਾ ਨਾਮ', 'full name'],
  ['ਨਾਮ', 'full name'],
  ['ਈਮੇਲ', 'email'], ['ਮੋਬਾਈਲ', 'mobile'], ['ਫ਼ੋਨ', 'phone'], ['ਫੋਨ', 'phone'],
  ['ਪਤਾ', 'address'], ['ਸ਼ਹਿਰ', 'city'], ['ਰਾਜ', 'state'], ['ਦੇਸ਼', 'country'],
  ['ਪਿੰਨ ਕੋਡ', 'pin code'], ['ਥਾਂ', 'location'],
  ['ਮੌਜੂਦਾ ਅਹੁਦਾ', 'current title'], ['ਅਹੁਦਾ', 'designation'],
  ['ਮੌਜੂਦਾ ਕੰਪਨੀ', 'current company'], ['ਕੰਪਨੀ', 'company'],
  ['ਕੁੱਲ ਤਜਰਬਾ', 'total experience'], ['ਤਜਰਬਾ', 'total experience'],
  ['ਸਕੂਲ', 'school'], ['ਯੂਨੀਵਰਸਿਟੀ', 'university'], ['ਕਾਲਜ', 'college'],
  ['ਡਿਗਰੀ', 'degree'], ['ਯੋਗਤਾ', 'qualification'], ['ਪਾਸ ਸਾਲ', 'passing year'],
  ['ਮੌਜੂਦਾ ਤਨਖਾਹ', 'current salary'], ['ਉਮੀਦ ਤਨਖਾਹ', 'expected salary'], ['ਤਨਖਾਹ', 'salary'],
  ['ਨੋਟਿਸ ਪੀਰੀਅਡ', 'notice period'], ['ਸ਼ੁਰੂ ਮਿਤੀ', 'start date'],
  ['ਤਬਾਦਲਾ', 'relocate'], ['ਕੰਮ ਦੀ ਇਜਾਜ਼ਤ', 'work permit'],
  ['ਰਿਜ਼ਿਊਮੇ', 'resume'], ['ਕਵਰ ਲੈਟਰ', 'cover letter'],
  ['ਹਾਂ', 'yes'], ['ਨਹੀਂ', 'no'], ['ਤੁਰੰਤ', 'immediately'],
  ['ਮਹੀਨਾ', 'month'], ['ਦਿਨ', 'days'],
];

/* ── Latin script ────────────────────────────────────────────────────────
   Whole words only, and only words that cannot appear in an English form. Both
   the accented and the unaccented spelling, because forms are inconsistent
   about it and `normalize` has not run yet. */
const LATIN: readonly Entry[] = [
  /* Spanish */
  ['apellidos', 'last name'], ['apellido', 'last name'], ['nombre completo', 'full name'],
  ['nombres', 'first name'], ['nombre', 'full name'],
  ['correo electrónico', 'email'], ['correo electronico', 'email'], ['correo', 'email'],
  ['teléfono', 'phone'], ['telefono', 'phone'], ['móvil', 'mobile'], ['movil', 'mobile'],
  ['dirección', 'address'], ['direccion', 'address'], ['ciudad', 'city'],
  ['país', 'country'], ['pais', 'country'], ['código postal', 'postal code'],
  ['empresa actual', 'current company'], ['empresa', 'company'],
  ['puesto actual', 'current title'], ['puesto', 'job title'], ['cargo', 'job title'],
  ['años de experiencia', 'years of experience'], ['anos de experiencia', 'years of experience'],
  ['experiencia', 'total experience'],
  ['universidad', 'university'], ['titulación', 'degree'], ['titulacion', 'degree'],
  ['salario actual', 'current salary'], ['salario deseado', 'expected salary'], ['salario', 'salary'],
  ['preaviso', 'notice period'], ['fecha de inicio', 'start date'],
  ['currículum', 'resume'], ['curriculum', 'resume'], ['hoja de vida', 'resume'],
  ['carta de presentación', 'cover letter'], ['carta de presentacion', 'cover letter'],
  ['sitio web', 'website'], ['sí', 'yes'],

  /* French */
  ['prénom', 'first name'], ['prenom', 'first name'],
  ['nom de famille', 'last name'], ['nom complet', 'full name'],
  ['courriel', 'email'], ['adresse e-mail', 'email'], ['adresse électronique', 'email'],
  ['téléphone', 'phone'], ['telephone', 'phone'], ['portable', 'mobile'],
  ['adresse', 'address'], ['ville', 'city'], ['pays', 'country'], ['code postal', 'postal code'],
  ['entreprise actuelle', 'current company'], ['entreprise', 'company'], ['société', 'company'],
  ['poste actuel', 'current title'], ['intitulé du poste', 'job title'],
  ['expérience', 'total experience'], ['universite', 'university'], ['université', 'university'],
  ['diplôme', 'degree'], ['diplome', 'degree'],
  ['salaire actuel', 'current salary'], ['salaire souhaité', 'expected salary'], ['salaire', 'salary'],
  ['préavis', 'notice period'], ['preavis', 'notice period'], ['date de début', 'start date'],
  ['lettre de motivation', 'cover letter'], ['site web', 'website'],
  ['oui', 'yes'], ['non', 'no'],

  /* German */
  ['vorname', 'first name'], ['nachname', 'last name'], ['familienname', 'family name'],
  ['vollständiger name', 'full name'],
  ['e-mail-adresse', 'email'], ['telefonnummer', 'phone'], ['telefon', 'phone'],
  ['mobilnummer', 'mobile'], ['handy', 'mobile'],
  ['anschrift', 'address'], ['straße', 'street'], ['strasse', 'street'],
  ['stadt', 'city'], ['wohnort', 'location'], ['land', 'country'],
  ['postleitzahl', 'postal code'], ['plz', 'postal code'],
  ['aktueller arbeitgeber', 'current employer'], ['arbeitgeber', 'employer'],
  ['unternehmen', 'company'], ['firma', 'company'],
  ['aktuelle position', 'current title'], ['berufsbezeichnung', 'job title'],
  ['berufserfahrung', 'total experience'], ['jahre erfahrung', 'years experience'],
  ['hochschule', 'university'], ['universität', 'university'], ['abschluss', 'degree'],
  ['aktuelles gehalt', 'current salary'], ['gehaltsvorstellung', 'expected salary'],
  ['gehalt', 'salary'],
  ['kündigungsfrist', 'notice period'], ['kundigungsfrist', 'notice period'],
  ['eintrittsdatum', 'start date'], ['verfügbar ab', 'available from'],
  ['lebenslauf', 'resume'], ['anschreiben', 'cover letter'], ['webseite', 'website'],
  ['umzugsbereit', 'relocate'], ['arbeitserlaubnis', 'work permit'],
  ['ja', 'yes'], ['nein', 'no'],

  /* Portuguese */
  ['sobrenome', 'last name'], ['nome completo', 'full name'],
  ['telemóvel', 'mobile'], ['telemovel', 'mobile'], ['telefone', 'phone'],
  ['endereço', 'address'], ['endereco', 'address'], ['cidade', 'city'],
  ['empresa atual', 'current company'],
  ['anos de experiência', 'years of experience'], ['experiência', 'total experience'],
  ['salário atual', 'current salary'], ['salário pretendido', 'expected salary'],
  ['salário', 'salary'],
  ['currículo', 'resume'], ['curriculo', 'resume'], ['carta de apresentação', 'cover letter'],
  ['sim', 'yes'], ['não', 'no'], ['nao', 'no'],
];

/* ── Compiling ───────────────────────────────────────────────────────── */

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface Rule { from: string; to: string; re: RegExp }

/**
 * Longest first, so "पहला नाम" is consumed before the "नाम" inside it can be
 * rewritten to "full name" and leave "पहला full name" behind. This ordering IS
 * the disambiguation — without it every two-word label loses its qualifier.
 */
function compile(entries: readonly Entry[], wholeWord: boolean): Rule[] {
  return [...entries]
    .sort((a, b) => b[0].length - a[0].length)
    .map(([from, to]) => ({
      from,
      to,
      /* `\b` is useless against accented letters in a JS regex, so the guard is
         "not adjacent to a letter or a digit" in any script instead. */
      re: wholeWord
        ? new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(from)}(?=[^\\p{L}\\p{N}]|$)`, 'giu')
        : new RegExp(escapeRe(from), 'gu'),
    }));
}

const NON_LATIN: Rule[] = compile([...HI, ...BN, ...TA, ...TE, ...GU, ...KN, ...ML, ...PA], false);
const LATIN_RULES: Rule[] = compile(LATIN, true);

/** Anything outside Latin and Latin-Extended. Cheap, and it skips the whole
    non-Latin table for the overwhelmingly common English form. */
const HAS_NON_LATIN = /[^ -ɏ]/;

/**
 * A form's own words, in the matcher's vocabulary.
 *
 * Returns the input unchanged when nothing matches — including for every
 * English label, which is the case that must stay free.
 */
export function translateLabel(raw: string | undefined): string {
  if (!raw) return '';
  let out = raw;

  if (HAS_NON_LATIN.test(out)) {
    for (const rule of NON_LATIN) {
      /* The cheap `includes` first: a regex `test` on every one of several
         hundred rules, for every field on a Workday page, is the one place
         this file could become slow enough to notice. */
      if (out.includes(rule.from)) out = out.split(rule.from).join(` ${rule.to} `);
    }
  }

  /* The Latin pass runs on everything: a Spanish or German label is all ASCII
     and would be skipped by the test above. The matched leading character is
     put back, so two adjacent terms both still match. */
  for (const rule of LATIN_RULES) {
    rule.re.lastIndex = 0;
    if (rule.re.test(out)) {
      rule.re.lastIndex = 0;
      out = out.replace(rule.re, (_m, pre: string) => `${pre}${rule.to} `);
    }
    rule.re.lastIndex = 0;
  }

  return out === raw ? raw : out.replace(/\s+/g, ' ').trim();
}

/** Whether a string held anything this file knows how to translate. For the
    selftest and for diagnostics; the pipeline just calls `translateLabel`. */
export function isTranslated(raw: string | undefined): boolean {
  return !!raw && translateLabel(raw) !== raw;
}

/** Every English phrase this file can produce. The selftest asserts each one
    is a phrase the matcher actually knows, because a translation landing
    outside the vocabulary is a silent no-op. */
export function targetPhrases(): string[] {
  const all = [...HI, ...BN, ...TA, ...TE, ...GU, ...KN, ...ML, ...PA, ...LATIN];
  return Array.from(new Set(all.map(([, to]) => to)));
}
