# GitHub Workflow Documentation - TimeCast Pro

## 📋 Table of Contents
1. [SSH Key Setup](#ssh-key-setup)
2. [Daily Git Workflow](#daily-git-workflow)
3. [Version Release Process](#version-release-process)
4. [Troubleshooting](#troubleshooting)
5. [Important Reminders](#important-reminders)

---

## 🔐 SSH Key Setup

### ✅ Current Configuration (Completed 2025-10-04)

**SSH Key Location**: `C:\Users\ogres\.ssh\id_ed25519_github`

**Public Key** (αυτό που είναι στο GitHub):
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDvcZQjBM9t/GCcw4CRAKy9ZwK/Akg60nw+cmt3KFKQ8 timecast-github-key
```

**GitHub Confirmation Email**:
```
TimeCast Development Key
SHA256:XXzHCJJzT5cB0dSzU0bLYQa4wqW8ubvSst6lPK1gcyQ
```

### SSH Config File (`~/.ssh/config`):
```
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_github
    IdentitiesOnly yes
```

### Test SSH Connection:
```bash
ssh -T git@github.com
# Expected output: "Hi OGRESTERGI! You've successfully authenticated..."
```

---

## 📝 Daily Git Workflow

### 1. Check Current Status
```bash
git status
git branch  # Verify current branch
```

### 2. Stage Changes
```bash
# Stage specific files
git add file1.js file2.html

# Stage all changes (use carefully)
git add .

# Stage by pattern
git add *.js
```

### 3. Commit Changes
```bash
# Single line commit
git commit -m "🐛 Fix bug in timer display"

# Multi-line commit with details
git commit -m "$(cat <<'EOF'
✨ Add new feature

- Feature description
- Implementation notes
- Breaking changes

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### 4. Push to GitHub
```bash
# Push current branch
git push origin master

# Push with force (ΠΡΟΣΟΧΗ - use only when necessary)
git push -f origin master

# Push new branch
git push -u origin feature/new-feature
```

### 5. Pull Latest Changes
```bash
# Fetch and merge
git pull origin master

# Fetch only (no merge)
git fetch origin
```

---

## 🚀 Version Release Process

### Step 1: Version Bump & Build
```bash
# Minor version (6.7.0 → 6.8.0)
npm run build:minor

# Patch version (6.7.0 → 6.7.1)
npm run build:patch

# Major version (6.7.0 → 7.0.0)
npm run build:major
```

**Τι κάνει**:
1. Updates `package.json` version
2. Updates `splash.html` and `about-dialog.html` versions
3. Builds portable .exe in `dist/` folder

### Step 2: Commit Version Changes
```bash
git add package.json package-lock.json splash.html about-dialog.html
git commit -m "🔖 v6.8.0 Release - Feature description"
```

### Step 3: Create GitHub Release
```bash
# Create release with .exe upload
gh release create v6.8.0 \
  "dist/TimeCast Pro ConferenceTimer-v6.8.0.exe" \
  --title "v6.8.0 - Feature Name" \
  --notes "$(cat <<'EOF'
## 🎉 TimeCast™ Pro v6.8.0

### ✨ New Features
- Feature 1 description
- Feature 2 description

### 🐛 Bug Fixes
- Fix 1 description
- Fix 2 description

### 📦 Installation
Download **TimeCast Pro ConferenceTimer-v6.8.0.exe** and run.

**Existing users**: Your license key will remain active automatically!

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Step 4: Push Commits
```bash
git push origin master
```

---

## ⚠️ Troubleshooting

### Problem: "Permission denied (publickey)"
**Solution**:
```bash
# Test SSH connection
ssh -T git@github.com

# If fails, add key to agent
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519_github

# Verify SSH config exists
cat ~/.ssh/config
```

### Problem: "Pack exceeds maximum allowed size (2.00 GiB)"
**Solution**: Repository too large (εγινε fix στις 2025-10-04)
```bash
# Check repository size
du -sh .git

# If >100MB, cleanup needed:
git gc --aggressive --prune=now
```

### Problem: Push timeout
**Solution**:
1. Check internet connection
2. Try SSH instead of HTTPS (ήδη configured)
3. If repository >2GB, see cleanup process below

### Problem: Merge conflicts
**Solution**:
```bash
# See conflicted files
git status

# Open file, resolve conflicts manually (look for <<<<<<, =======, >>>>>> markers)
# Then:
git add resolved-file.js
git commit -m "🔀 Resolve merge conflict"
```

---

## 🔧 Repository Maintenance

### Clean Repository (ΠΡΟΣΟΧΗ - Destructive)
**Only if repository becomes too large (>500MB)**

```bash
# 1. Backup current .git
mv .git .git-backup-$(date +%Y%m%d)

# 2. Initialize fresh repository
git init
git remote add origin git@github.com:OGRESTERGI/timecast-pro.git

# 3. Add files with proper .gitignore
git add .
git commit -m "🎉 Clean repository initialization"

# 4. Force push (OVERWRITES GitHub history)
git push -f origin master
```

**⚠️ ΠΡΟΣΟΧΗ**: Αυτό διαγράφει όλο το Git history!

### What NOT to Commit
Το `.gitignore` file αποτρέπει αυτά:
- ❌ `dist/*.exe` - Build outputs
- ❌ `node_modules/` - Dependencies
- ❌ `*.json` (except package.json) - User data
- ❌ `temp/` - Temporary files
- ❌ `*.log` - Log files
- ❌ Large binary files (>10MB)

---

## 📊 Repository Stats

### Current Repository (as of 2025-10-04)
```
Repository: github.com/OGRESTERGI/timecast-pro
Size: 3.2 MB (clean!)
Files: 70 tracked files
History: Clean, single initial commit
SSH: Configured ✅
```

### Old Repository (before cleanup)
```
Size: 2.6 GB (!!!)
Problem: 2.6GB .zip file in obsolete-files/
Solution: Fresh repository με perfect .gitignore
Result: 812x smaller! (99.9% reduction)
```

---

## 🎯 Git Commit Message Convention

### Emoji Prefixes (used in TimeCast Pro):
- `🎉` - Major release / Initial commit
- `✨` - New feature
- `🐛` - Bug fix
- `🔖` - Version bump
- `🔧` - Configuration change
- `📝` - Documentation
- `🔀` - Merge branches
- `♻️` - Refactoring
- `🔥` - Remove code/files
- `🎨` - UI/UX improvements
- `⚡` - Performance improvement
- `🔒` - Security fix
- `🌐` - Internationalization
- `🧹` - Cleanup

### Example Commit Messages:
```bash
# Good ✅
git commit -m "✨ Add auto-update notification system"
git commit -m "🐛 Fix timer countdown bug in grace period"
git commit -m "🔖 v6.7.0 Release - Auto-Update System"

# Bad ❌
git commit -m "fix"
git commit -m "updates"
git commit -m "changes to admin.html"
```

---

## 🔄 Branch Strategy

### Current Branches:
- `master` - Production-ready code
- `feature/*` - Feature development (optional)

### Creating Feature Branch:
```bash
# Create and switch to feature branch
git checkout -b feature/new-feature

# Work on feature...
git add .
git commit -m "✨ Implement new feature"

# Push feature branch
git push -u origin feature/new-feature

# Merge back to master
git checkout master
git merge feature/new-feature
git push origin master
```

---

## 📦 GitHub Releases

### Release Checklist:
1. ✅ Version bump completed (`npm run build:minor`)
2. ✅ .exe file built in `dist/` folder
3. ✅ Version changes committed
4. ✅ GitHub Release created με `gh release create`
5. ✅ .exe file uploaded to release
6. ✅ Changelog written
7. ✅ Commits pushed to master

### View Releases:
- Web: https://github.com/OGRESTERGI/timecast-pro/releases
- CLI: `gh release list`

### Download Latest Release:
```bash
# List releases
gh release list

# Download specific release
gh release download v6.7.0
```

---

## 🛡️ Security Best Practices

### SSH Key Security:
- ✅ **NEVER** share private key (`id_ed25519_github`)
- ✅ **ONLY** share public key (`.pub` file)
- ✅ Key is protected με GitHub account 2FA
- ✅ Key is tied to this specific machine

### What to Do if Key is Compromised:
1. Go to https://github.com/settings/keys
2. Delete compromised key
3. Generate new key: `ssh-keygen -t ed25519 -C "new-key" -f ~/.ssh/id_ed25519_github_new`
4. Add new public key to GitHub
5. Update SSH config με new key path

---

## 📞 Common Commands Quick Reference

```bash
# Status & Info
git status              # Check current changes
git log --oneline -10   # Recent commits
git remote -v          # Show remote URLs
git branch             # List branches

# Basic Operations
git add .              # Stage all changes
git commit -m "msg"    # Commit changes
git push origin master # Push to GitHub
git pull origin master # Pull from GitHub

# SSH Operations
ssh -T git@github.com  # Test connection
ssh-add -l            # List loaded keys

# GitHub CLI
gh auth status        # Check authentication
gh release list       # List releases
gh repo view          # View repo info

# Cleanup
git gc --aggressive   # Optimize repository
git prune             # Remove unreachable objects
```

---

## 📚 Additional Resources

- **GitHub SSH Documentation**: https://docs.github.com/en/authentication/connecting-to-github-with-ssh
- **Git Documentation**: https://git-scm.com/doc
- **GitHub CLI**: https://cli.github.com/manual/
- **TimeCast Pro Repository**: https://github.com/OGRESTERGI/timecast-pro

---

## 📝 Session Notes

### 2025-10-04 - Fresh Repository Setup
**Actions Taken**:
1. ✅ Generated SSH key: `id_ed25519_github`
2. ✅ Added public key to GitHub account
3. ✅ Created SSH config for automatic key usage
4. ✅ Cleaned repository: 2.6GB → 3.2MB (99.9% reduction)
5. ✅ Created perfect `.gitignore`
6. ✅ Fresh Git initialization με clean history
7. ✅ Force push to GitHub - SUCCESS
8. ✅ Created v6.7.0 release με auto-update system

**Current Status**:
- Repository: Clean, optimized, production-ready
- SSH: Configured and working
- Releases: v6.7.0 available με .exe download
- Auto-update: Fully functional

**Backup Location**:
- Old .git: `.git-backup-20251004` (2.6GB, kept locally for history)

---

**Last Updated**: 2025-10-04
**Maintained by**: OGRESTERGI
**Repository**: https://github.com/OGRESTERGI/timecast-pro
