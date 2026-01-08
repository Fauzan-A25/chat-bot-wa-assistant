function generateSlug(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function formatProjectPreview(projectInfo) {
    return `
📋 **PROJECT PREVIEW**

**Title:** ${projectInfo.title}
**Slug:** ${projectInfo.slug}
**Category:** ${projectInfo.category}
**Status:** ${projectInfo.status}
**Year:** ${projectInfo.year}
**Duration:** ${projectInfo.duration}
**Team Size:** ${projectInfo.teamSize}
**Role:** ${projectInfo.role}

**Short Description:**
${projectInfo.shortDescription}

**Description:**
${projectInfo.description.substring(0, 200)}...

**Tags:** ${Array.isArray(projectInfo.tags) ? projectInfo.tags.join(', ') : projectInfo.tags}
**Technologies:** ${Array.isArray(projectInfo.technologies) ? projectInfo.technologies.join(', ') : projectInfo.technologies}
**Features:** ${projectInfo.features.length} items
**Highlights:** ${projectInfo.highlights.length} items

**URLs:**
• GitHub: ${projectInfo.githubUrl}
• Demo: ${projectInfo.demoUrl || 'N/A'}
• Image: ${projectInfo.image}

📝 **COMMANDS:**
✅ .confirm - Simpan ke sheets
✏️ .edit [field] [value] - Edit field
📋 .show - Tampilkan detail lengkap
❌ .cancel - Batalkan

**Contoh edit:**
\`.edit title New Project Title\`
\`.edit category Machine Learning\`
\`.edit year 2025\`
    `.trim();
}

function showEditableFields(projectInfo) {
    return `
📝 **EDITABLE FIELDS**

**String Fields:**
• title: ${projectInfo.title}
• slug: ${projectInfo.slug}
• shortDescription: ${projectInfo.shortDescription.substring(0, 50)}...
• category: ${projectInfo.category}
• status: ${projectInfo.status}
• duration: ${projectInfo.duration}
• role: ${projectInfo.role}
• demoUrl: ${projectInfo.demoUrl || 'kosong'}
• videoUrl: ${projectInfo.videoUrl || 'kosong'}

**Number Fields:**
• year: ${projectInfo.year}
• teamSize: ${projectInfo.teamSize}

**Boolean:**
• featured: ${projectInfo.featured}

**Array Fields (gunakan JSON):**
• tags: ${JSON.stringify(projectInfo.tags)}
• technologies: ${JSON.stringify(projectInfo.technologies)}
• features: ${JSON.stringify(projectInfo.features)}
• highlights: ${JSON.stringify(projectInfo.highlights)}

**Edit Format:**
\`.edit [field] [value]\`

**Contoh:**
\`.edit title My Awesome Project\`
\`.edit year 2025\`
\`.edit featured true\`
\`.edit tags ["ML","AI","Python"]\`
    `.trim();
}

function parseEditValue(field, value, projectInfo) {
    const arrayFields = ['tags', 'technologies', 'features', 'highlights'];
    if (arrayFields.includes(field)) {
        try {
            return JSON.parse(value);
        } catch (e) {
            return value.split(',').map(v => v.trim());
        }
    }
    
    if (field === 'year' || field === 'teamSize') {
        return parseInt(value);
    }
    
    if (field === 'featured') {
        return value.toLowerCase() === 'true';
    }
    
    if (field === 'slug') {
        return generateSlug(value);
    }
    
    return value;
}

async function extractProjectInfo(repoData, readmeContent, generateWithFallback) {
    const prompt = `
Kamu adalah expert dalam menganalisis GitHub repository. Berdasarkan data repository dan README di bawah, ekstrak informasi project dalam format JSON yang PERSIS seperti ini:

**REPOSITORY DATA:**
- Name: ${repoData.name}
- Description: ${repoData.description || 'N/A'}
- Language: ${repoData.language || 'N/A'}
- Stars: ${repoData.stargazers_count}
- Forks: ${repoData.forks_count}
- Created: ${repoData.created_at}
- Updated: ${repoData.updated_at}
- Topics: ${repoData.topics?.join(', ') || 'N/A'}
- Homepage: ${repoData.homepage || ''}

**README CONTENT:**
${readmeContent ? readmeContent.substring(0, 3000) : 'No README available'}

**OUTPUT HARUS JSON FORMAT INI (NO EXPLANATION, JSON ONLY):**
{
  "title": "Project Name (dari README atau repo name)",
  "slug": "project-name-lowercase",
  "shortDescription": "1 kalimat singkat (max 100 char)",
  "description": "Deskripsi lengkap dari README (2-3 paragraf)",
  "tags": ["tag1", "tag2", "tag3"],
  "technologies": ["tech1", "tech2", "tech3"],
  "features": ["feature 1", "feature 2", "feature 3"],
  "category": "Web Development/Machine Learning/Mobile App/Data Science",
  "status": "Completed/In Progress",
  "year": 2024,
  "duration": "2 months",
  "role": "Full Stack Developer/Data Scientist/etc",
  "teamSize": 1,
  "highlights": ["highlight 1", "highlight 2", "highlight 3"]
}

JSON OUTPUT:`;

    try {
        const result = await generateWithFallback({
            contents: prompt
        });
        
        let jsonText = result.text.trim();
        
        if (jsonText.includes('```json')) {
            jsonText = jsonText.split('```json')[1].split('```')[0].trim();
        } else if (jsonText.includes('```')) {
            jsonText = jsonText.split('```')[1].split('```')[0].trim();
        }
        
        const projectInfo = JSON.parse(jsonText);
        
        projectInfo.githubUrl = repoData.html_url;
        projectInfo.demoUrl = repoData.homepage || '';
        projectInfo.videoUrl = '';
        projectInfo.image = `./images/Projects/${projectInfo.slug}.png`;
        projectInfo.featured = false;
        
        return projectInfo;
        
    } catch (error) {
        console.error('❌ AI extraction failed:', error);
        throw new Error('Gagal extract project info dengan AI');
    }
}

module.exports = {
    generateSlug,
    formatProjectPreview,
    showEditableFields,
    parseEditValue,
    extractProjectInfo
};
