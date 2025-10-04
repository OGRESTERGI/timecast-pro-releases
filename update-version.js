const fs = require('fs');
const path = require('path');

// Read the current version from package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const newVersion = packageJson.version;

console.log(`🔄 Updating version to ${newVersion} in all files...`);

// Files to update with version numbers
const filesToUpdate = [
    {
        file: 'splash.html',
        pattern: /<div class="version">\s*v[\d.]+\s*<\/div>/,
        replacement: `<div class="version">
    v${newVersion}
  </div>`
    },
    {
        file: 'admin.html', 
        pattern: /TimeCast[®™] Pro v[\d.]+/g,
        replacement: `TimeCast™ Pro v${newVersion}`
    },
    {
        file: 'timer.html',
        pattern: /TimeCast[®™] Pro v[\d.]+/g,
        replacement: `TimeCast™ Pro v${newVersion}`
    },
    {
        file: 'questions-admin.html',
        pattern: /TimeCast[®™] Pro v[\d.]+/g,
        replacement: `TimeCast™ Pro v${newVersion}`
    },
    {
        file: 'about-dialog.html',
        pattern: /v[\d.]+/g,
        replacement: `v${newVersion}`
    },
    {
        file: 'gdpr-dialog.html', 
        pattern: /v[\d.]+/g,
        replacement: `v${newVersion}`
    },
    {
        file: 'exit-dialog.html',
        pattern: /v[\d.]+/g,
        replacement: `v${newVersion}`
    }
];

let updatedFiles = 0;

filesToUpdate.forEach(({ file, pattern, replacement }) => {
    const filePath = path.join(__dirname, file);
    
    if (!fs.existsSync(filePath)) {
        console.log(`⚠️  File not found: ${file}`);
        return;
    }
    
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        const originalContent = content;
        
        content = content.replace(pattern, replacement);
        
        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`✅ Updated version in: ${file}`);
            updatedFiles++;
        } else {
            console.log(`ℹ️  No version pattern found in: ${file}`);
        }
        
    } catch (error) {
        console.error(`❌ Error updating ${file}:`, error.message);
    }
});

console.log(`🎉 Version update complete! Updated ${updatedFiles} files to v${newVersion}`);