const CHAT_MODELS = [
    { name: 'gemini-3-flash-preview', maxOutput: 65536, priority: 1, cost: 'low', description: 'Fastest 2025' },
    { name: 'gemini-2.5-flash', maxOutput: 65536, priority: 2, cost: 'medium', description: 'Advanced 2025' },
    { name: 'gemini-2.5-flash-lite', maxOutput: 65536, priority: 3, cost: 'high', description: 'Stable fallback' }
];

const SUMMARY_MODELS = [
    { name: 'gemini-2.5-flash-lite', maxOutput: 65536, priority: 1, cost: 'lowest', description: 'Ultra cheap' },
    { name: 'gemini-2.5-flash', maxOutput: 65536, priority: 2, cost: 'low', description: 'Fast & reliable' }
];

// 🔥 COMPLETE SHEET MAPPING - Updated based on actual Google Sheets
const SHEET_NAME_MAP = {
    // PersonalInfo (FIXED: was PersonnalInfo with typo)
    'personalinfo': 'PersonalInfo',
    'personal info': 'PersonalInfo',
    'personal': 'PersonalInfo',
    'userinfo': 'PersonalInfo',
    'profile': 'PersonalInfo',
    'biodata': 'PersonalInfo',
    'info': 'PersonalInfo',
    
    // SocialLinks
    'sociallinks': 'SocialLinks',
    'social links': 'SocialLinks',
    'social': 'SocialLinks',
    'sosmed': 'SocialLinks',
    'link sosial': 'SocialLinks',
    
    // Projects
    'projects': 'Projects',
    'project': 'Projects',
    'portofolio': 'Projects',
    'portfolio': 'Projects',
    
    // ProjectsContent
    'projectscontent': 'ProjectsContent',
    'projects content': 'ProjectsContent',
    'project content': 'ProjectsContent',
    'konten project': 'ProjectsContent',
    
    // ProjectCategories
    'projectcategories': 'ProjectCategories',
    'project categories': 'ProjectCategories',
    'kategori project': 'ProjectCategories',
    'categories': 'ProjectCategories',
    
    // Skills
    'skills': 'Skills',
    'skill': 'Skills',
    'keahlian': 'Skills',
    'kemampuan': 'Skills',
    
    // SkillsContent
    'skillscontent': 'SkillsContent',
    'skills content': 'SkillsContent',
    'skill content': 'SkillsContent',
    'konten skill': 'SkillsContent',
    
    // Experiences
    'experiences': 'Experiences',
    'experience': 'Experiences',
    'pengalaman': 'Experiences',
    'work': 'Experiences',
    'pekerjaan': 'Experiences',
    
    // Education
    'education': 'Education',
    'pendidikan': 'Education',
    'edukasi': 'Education',
    'sekolah': 'Education',
    'kuliah': 'Education',
    
    // Certifications
    'certifications': 'Certifications',
    'certification': 'Certifications',
    'sertifikat': 'Certifications',
    'sertifikasi': 'Certifications',
    'certificate': 'Certifications',
    
    // NavLinks
    'navlinks': 'NavLinks',
    'nav links': 'NavLinks',
    'navigation': 'NavLinks',
    'navigasi': 'NavLinks',
    'menu': 'NavLinks',
    
    // AboutContent
    'aboutcontent': 'AboutContent',
    'about content': 'AboutContent',
    'about': 'AboutContent',
    'tentang': 'AboutContent',
    'konten about': 'AboutContent',
    
    // ContactContent
    'contactcontent': 'ContactContent',
    'contact content': 'ContactContent',
    'contact': 'ContactContent',
    'kontak': 'ContactContent',
    'hubungi': 'ContactContent',
    
    // FooterContent
    'footercontent': 'FooterContent',
    'footer content': 'FooterContent',
    'footer': 'FooterContent',
    'konten footer': 'FooterContent',
    
    // HeroTypingTexts
    'herotypingtexts': 'HeroTypingTexts',
    'hero typing texts': 'HeroTypingTexts',
    'hero typing': 'HeroTypingTexts',
    'typing texts': 'HeroTypingTexts',
    'teks hero': 'HeroTypingTexts',
    
    // KantongSaku (ADMIN ONLY - Expense Tracker)
    'kantongsaku': 'KantongSaku',
    'kantong saku': 'KantongSaku',
    'kantong': 'KantongSaku',
    'expense': 'KantongSaku',
    'pengeluaran': 'KantongSaku',
    'uang': 'KantongSaku',
    'wallet': 'KantongSaku',
    'dompet': 'KantongSaku'
};

const TOOL_TRIGGER_WORDS = [
    'lihat', 'baca', 'data', 'sheet', 'kolom', 
    'struktur', 'record', 'row', 'baris', 'ada',
    'tampilkan', 'show', 'ambil', 'get', 'cari',
    'apa', 'berapa', 'list', 'daftar'
];

const SPREADSHEET_TOOLS_FIXED = [{
    functionDeclarations: [
        {
            name: 'list_sheets',
            description: "Daftar semua sheets yang tersedia. Gunakan: 'sheet apa saja?' atau 'list sheets'",
            parameters: { type: "object", properties: {}, required: [] }
        },
        {
            name: 'read_sheet',
            description: "Baca SEMUA data dari sheet tertentu. Contoh: read_sheet('PersonnalInfo'), read_sheet('Projects'), read_sheet('Skills')",
            parameters: {
                type: "object",
                properties: {
                    sheet_name: { 
                        type: "string", 
                        description: "Exact sheet name. Available: PersonnalInfo, SocialLinks, Projects, ProjectsContent, ProjectCategories, Skills, SkillsContent, Experiences, Education, Certifications, Stats, NavLinks, AboutContent, ContactContent, FooterContent, HeroTypingTexts, EmailJSConfig"
                    }
                },
                required: ['sheet_name']
            }
        },
        {
            name: 'get_schema',
            description: "Dapatkan struktur kolom dari sheet. Contoh: get_schema('PersonnalInfo')",
            parameters: {
                type: "object",
                properties: {
                    sheet_name: { 
                        type: "string", 
                        description: "Exact sheet name" 
                    }
                },
                required: ['sheet_name']
            }
        }
    ]
}];

const ANTI_HALLUCINATION_PROMPT = `
🚨 **PAKSA GUNAKAN TOOLS - TIDAK BOLEH TEBAK DATA!**

**AVAILABLE SHEETS:**
1. PersonnalInfo → Data personal/profile
2. SocialLinks → Link media sosial
3. Projects → Daftar project
4. ProjectsContent → Konten halaman projects
5. ProjectCategories → Kategori project
6. Skills → Keahlian/skills
7. SkillsContent → Konten halaman skills
8. Experiences → Pengalaman kerja
9. Education → Riwayat pendidikan
10. Certifications → Sertifikat
11. Stats → Statistik/angka
12. NavLinks → Menu navigasi
13. AboutContent → Konten halaman about
14. ContactContent → Konten halaman contact
15. FooterContent → Konten footer
16. HeroTypingTexts → Teks typing hero section
17. EmailJSConfig → Konfigurasi EmailJS

**RULES:**
1. User bilang "lihat projects" → read_sheet("Projects")
2. User bilang "skills apa?" → read_sheet("Skills")
3. User bilang "pendidikan" → read_sheet("Education")
4. Tool ERROR → "❌ Sheet tidak ditemukan"
5. **JANGAN** buat data palsu atau tebak-tebakan!
6. Kalau unsure, tanya user: "Sheet mana yang mau dilihat?"

**CONTOH BENAR:**
❌ "Kamu punya 5 projects" (TEBAKAN!)
✅ read_sheet("Projects") → "Ada 5 projects: [data real]"
`;

// All available sheet names (for validation)
const AVAILABLE_SHEETS = [
    'PersonnalInfo',
    'SocialLinks',
    'Projects',
    'ProjectsContent',
    'ProjectCategories',
    'Skills',
    'SkillsContent',
    'Experiences',
    'Education',
    'Certifications',
    'Stats',
    'NavLinks',
    'AboutContent',
    'ContactContent',
    'FooterContent',
    'HeroTypingTexts',
    'EmailJSConfig'
];

module.exports = {
    CHAT_MODELS,
    SUMMARY_MODELS,
    SHEET_NAME_MAP,
    TOOL_TRIGGER_WORDS,
    SPREADSHEET_TOOLS_FIXED,
    ANTI_HALLUCINATION_PROMPT,
    AVAILABLE_SHEETS
};
