# Platform Comparison: Git, GitHub, GitLab

Hackflow supports three major platforms for version control and collaboration. This guide helps you choose the right tool for your task.

## Quick Comparison

| Feature | Git Server | GitHub Server | GitLab Server |
|---------|-----------|--------------|--------------|
| **Type** | Local git ops | GitHub API | GitLab API |
| **Installation** | Python (uvx) | Docker | Node.js (npx) |
| **Best For** | Local changes | GitHub.com | GitLab.com + Self-hosted |
| **Internet Required** | No | Yes | Yes |
| **Push Support** | ❌ No | ✅ Yes | ✅ Yes |
| **Issues/MRs** | ❌ No | ✅ Yes | ✅ Yes |
| **CI/CD** | ❌ No | ✅ Actions | ✅ Pipelines |
| **Tools** | 8 tools | 100+ tools | 95+ tools |

## When to Use Each

### Use Git Server When...

✅ **You want to inspect local changes**
- Check git status
- View diffs
- See commit history
- Check what's staged

✅ **You're working offline**
- No internet connection needed
- Fast local operations
- Safe read-only by default

❌ **Don't use for:**
- Pushing code (not supported)
- Creating PRs/MRs
- Managing issues

**Example workflows:**
```bash
npm run dev -- run workflows/git/add-commit.yaml
npm run dev -- run examples/git-status-test.yaml
```

---

### Use GitHub Server When...

✅ **You're working with GitHub.com**
- Creating pull requests
- Managing GitHub issues
- Triggering GitHub Actions
- Searching GitHub code

✅ **You need GitHub-specific features**
- GitHub Projects
- Dependabot integration
- Code scanning alerts
- GitHub Copilot integration

❌ **Don't use for:**
- GitLab repositories
- Local git operations (use Git server)
- Self-hosted git platforms

**Example workflows:**
```bash
npm run dev -- run examples/github-create-pr-workflow.yaml
npm run dev -- run examples/github-create-issue.yaml
```

**Configuration:**
- Requires Docker
- GitHub Personal Access Token
- Works with GitHub.com

---

### Use GitLab Server When...

✅ **You're working with GitLab.com or self-hosted GitLab**
- Creating merge requests
- Managing GitLab issues
- Triggering GitLab CI pipelines
- Working with GitLab wikis

✅ **You need GitLab-specific features**
- GitLab Projects
- GitLab Milestones
- GitLab Releases
- Self-hosted GitLab instances

❌ **Don't use for:**
- GitHub repositories
- Local git operations (use Git server)
- Platforms other than GitLab

**Example workflows:**
```bash
npm run dev -- run workflows/gitlab/create-merge-request.yaml
npm run dev -- run workflows/gitlab/create-issue.yaml
```

**Configuration:**
- Requires Node.js (npx)
- GitLab Personal Access Token or OAuth2
- Works with GitLab.com AND self-hosted

---

## Common Workflows by Platform

### Scenario 1: Check Local Changes Before Committing

**Use:** Git Server

```bash
npm run dev -- run examples/git-status-test.yaml
```

**Why:** Fast, local, no internet needed

---

### Scenario 2: Create a Pull Request on GitHub

**Use:** GitHub Server

```bash
npm run dev -- run examples/github-create-pr-workflow.yaml
```

**Why:** Direct GitHub API integration, full PR features

---

### Scenario 3: Create a Merge Request on GitLab

**Use:** GitLab Server

```bash
npm run dev -- run workflows/gitlab/create-merge-request.yaml
```

**Why:** Native GitLab MR support with all features

---

### Scenario 4: Check CI/CD Status

**For GitHub:**
```bash
# Use GitHub server to check Actions
npm run dev -- run examples/github-actions-status.yaml
```

**For GitLab:**
```bash
# Use GitLab server to check pipelines
# (Requires USE_PIPELINE=true in config)
npm run dev -- run workflows/gitlab/check-pipeline.yaml
```

---

### Scenario 5: Create an Issue

**For GitHub:**
```bash
npm run dev -- run examples/github-create-issue.yaml
```

**For GitLab:**
```bash
npm run dev -- run workflows/gitlab/create-issue.yaml
```

**Key Difference:** GitHub uses owner/repo names, GitLab uses numeric project IDs

---

## Configuration Comparison

### Git Server (Local Operations)

```json
{
  "git": {
    "command": "uvx",
    "args": ["mcp-server-git"]
  }
}
```

**Environment Variables:** None required

**Pros:**
- No configuration needed
- Works offline
- Fast

**Cons:**
- Read-only (can't push)
- No PR/MR support

---

### GitHub Server (GitHub.com)

```json
{
  "github": {
    "command": "docker",
    "args": [
      "run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
      "ghcr.io/github/github-mcp-server:main"
    ],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
    }
  }
}
```

**Environment Variables:**
```bash
export GITHUB_TOKEN=ghp_your_token_here
```

**Pros:**
- Official GitHub server
- 100+ tools
- GitHub Copilot integration
- Frequent updates

**Cons:**
- Requires Docker
- GitHub.com only
- Docker must be running

---

### GitLab Server (GitLab.com + Self-hosted)

```json
{
  "gitlab": {
    "command": "npx",
    "args": ["-y", "@zereight/mcp-gitlab"],
    "env": {
      "GITLAB_PERSONAL_ACCESS_TOKEN": "${GITLAB_TOKEN}",
      "GITLAB_API_URL": "${GITLAB_API_URL}"
    }
  }
}
```

**Environment Variables:**
```bash
export GITLAB_TOKEN=glpat_your_token_here
export GITLAB_API_URL=https://gitlab.com/api/v4
# Or for self-hosted:
export GITLAB_API_URL=https://gitlab.mycompany.com/api/v4
```

**Pros:**
- Works with GitLab.com AND self-hosted
- No Docker needed (uses npx)
- OAuth2 support
- 95+ tools

**Cons:**
- Requires Node.js
- Uses numeric project IDs (not names)

---

## Authentication Comparison

### Git Server
**Auth:** None (local operations)
**Setup:** Zero configuration

### GitHub Server
**Auth:** Personal Access Token (PAT)
**Setup:**
1. Create PAT at: https://github.com/settings/tokens
2. Required scopes: `repo` (for private repos) or none (for public)
3. Set `GITHUB_TOKEN` environment variable

**Permissions needed:**
- `repo` - Full repository access
- `workflow` - GitHub Actions (optional)
- `read:org` - Organization access (optional)

### GitLab Server
**Auth:** Personal Access Token (PAT) or OAuth2
**Setup:**

**Option 1 - PAT:**
1. Create PAT at: https://gitlab.com/-/user_settings/personal_access_tokens
2. Required scope: `api`
3. Set `GITLAB_TOKEN` environment variable

**Option 2 - OAuth2 (recommended):**
1. Create OAuth app in GitLab settings
2. Set `GITLAB_USE_OAUTH=true`
3. Browser will open for authorization on first use

**Permissions needed:**
- `api` - Complete read/write access

---

## Feature Matrix

### Repository Operations

| Feature | Git | GitHub | GitLab |
|---------|-----|--------|--------|
| Get file contents | ✅ | ✅ | ✅ |
| Create/update files | ❌ | ✅ | ✅ |
| Push multiple files | ❌ | ✅ | ✅ |
| Create branches | ❌ | ✅ | ✅ |
| View diffs | ✅ | ✅ | ✅ |
| Search code | ❌ | ✅ | ✅ |

### Issues & PRs/MRs

| Feature | Git | GitHub | GitLab |
|---------|-----|--------|--------|
| Create issues | ❌ | ✅ | ✅ |
| Update issues | ❌ | ✅ | ✅ |
| Create PR/MR | ❌ | ✅ | ✅ |
| Merge PR/MR | ❌ | ✅ | ✅ |
| Add comments | ❌ | ✅ | ✅ |
| View diffs | ✅ | ✅ | ✅ |

### CI/CD

| Feature | Git | GitHub | GitLab |
|---------|-----|--------|--------|
| Trigger builds | ❌ | ✅ | ✅ |
| Get job logs | ❌ | ✅ | ✅ |
| Retry jobs | ❌ | ✅ | ✅ |
| Cancel runs | ❌ | ✅ | ✅ |

### Advanced Features

| Feature | Git | GitHub | GitLab |
|---------|-----|--------|--------|
| Projects/Boards | ❌ | ✅ | ✅ |
| Wiki pages | ❌ | ❌ | ✅ |
| Milestones | ❌ | ❌ | ✅ |
| Labels | ❌ | ✅ | ✅ |
| Releases | ❌ | ✅ | ✅ |

---

## Using Multiple Servers

You can (and should!) use all three servers together:

```json
{
  "git": {
    "command": "uvx",
    "args": ["mcp-server-git"]
  },
  "github": {
    "command": "docker",
    "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
             "ghcr.io/github/github-mcp-server:main"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
    }
  },
  "gitlab": {
    "command": "npx",
    "args": ["-y", "@zereight/mcp-gitlab"],
    "env": {
      "GITLAB_PERSONAL_ACCESS_TOKEN": "${GITLAB_TOKEN}",
      "GITLAB_API_URL": "${GITLAB_API_URL}"
    }
  }
}
```

### Workflow Example: Complete Development Flow

```bash
# 1. Check local changes (Git)
npm run dev -- run examples/git-status-test.yaml

# 2. Commit locally (Git)
npm run dev -- run workflows/git/add-commit.yaml

# 3. Create GitHub PR (GitHub)
npm run dev -- run examples/github-create-pr-workflow.yaml

# 4. Create GitLab MR (GitLab)
npm run dev -- run workflows/gitlab/create-merge-request.yaml
```

---

## Decision Tree

```
Need to work with git?
│
├─ Local changes only?
│  └─ Use: Git Server
│     └─ Example: git-status-test.yaml
│
├─ GitHub.com repository?
│  ├─ Create PR/Issue?
│  │  └─ Use: GitHub Server
│  │     └─ Example: github-create-pr-workflow.yaml
│  └─ Check local changes first?
│     └─ Use: Git Server → GitHub Server
│        └─ Example: git-status-test.yaml → github-create-pr-workflow.yaml
│
└─ GitLab repository?
   ├─ Create MR/Issue?
   │  └─ Use: GitLab Server
   │     └─ Example: gitlab-create-merge-request.yaml
   └─ Check local changes first?
      └─ Use: Git Server → GitLab Server
         └─ Example: git-status-test.yaml → gitlab-create-merge-request.yaml
```

---

## Performance Comparison

### Speed

| Operation | Git | GitHub | GitLab |
|-----------|-----|--------|--------|
| Local status | ⚡ Instant | N/A | N/A |
| Create PR/MR | N/A | 🚀 Fast | 🚀 Fast |
| Get file | ⚡ Instant | 🌐 Network | 🌐 Network |
| Search code | N/A | 🌐 Network | 🌐 Network |

### Resource Usage

| Server | Memory | Startup |
|--------|--------|---------|
| Git | ~20MB | Instant |
| GitHub | ~200MB | 2-3 seconds |
| GitLab | ~50MB | 1-2 seconds |

---

## Documentation Links

### Full Guides
- **Git**: `docs/MCP_GUIDE.md`
- **GitHub**: `docs/GITHUB_MCP_SERVER.md`
- **GitLab**: `docs/GITLAB_MCP_SERVER.md`

### Quick References
- **GitHub**: `examples/GITHUB_QUICK_REFERENCE.md`
- **Workflows**: `workflows/README.md`

### Setup Guides
- **GitHub Version Pinning**: `docs/GITHUB_MCP_VERSION_PINNING.md`
- **MCP Configuration**: `docs/MCP_PLUGGABILITY.md`

---

## Summary

**For local git operations** → Use Git Server
**For GitHub.com** → Use GitHub Server  
**For GitLab** → Use GitLab Server

**Best Practice:** Configure all three and use them as needed! Each server complements the others perfectly.
