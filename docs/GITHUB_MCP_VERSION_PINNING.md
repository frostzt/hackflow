# GitHub MCP Server - Version Management

## Quick Fix for Upstream Issues

If GitHub MCP Server has an upstream bug that's been fixed on `main` but not yet released, you can quickly switch to the latest code.

## Using Different Versions

### Latest Release (Default, Stable)
```json
{
  "github": {
    "command": "docker",
    "args": [
      "run",
      "-i",
      "--rm",
      "-e",
      "GITHUB_PERSONAL_ACCESS_TOKEN",
      "ghcr.io/github/github-mcp-server"
    ],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
    }
  }
}
```

### Main Branch (Latest Code, Use After Hotfixes)
```json
{
  "github": {
    "command": "docker",
    "args": [
      "run",
      "-i",
      "--rm",
      "-e",
      "GITHUB_PERSONAL_ACCESS_TOKEN",
      "ghcr.io/github/github-mcp-server:main"
    ],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
    }
  }
}
```

### Specific Version (Pin to a Known Good Version)
```json
{
  "github": {
    "command": "docker",
    "args": [
      "run",
      "-i",
      "--rm",
      "-e",
      "GITHUB_PERSONAL_ACCESS_TOKEN",
      "ghcr.io/github/github-mcp-server:v0.26.1"
    ],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
    }
  }
}
```

## When to Use Each Version

### Use Latest Release (no tag)
✅ **Default choice** - Most stable
✅ For production workflows
✅ When everything is working

### Use Main Branch (`:main`)
✅ **When there's a breaking bug** that was just fixed upstream
✅ To test new features before release
✅ When GitHub team says "fixed on main"
⚠️ May have unreleased bugs

### Use Specific Version (`:v0.26.1`)
✅ **Pin to known good version** for critical workflows
✅ When you need reproducibility
✅ To avoid breaking changes from updates
⚠️ Won't get bug fixes automatically

## Switching Versions

### Step 1: Update Config

Edit `~/.hackflow/mcp-servers.json` and change the image tag:

```json
"ghcr.io/github/github-mcp-server:main"
```

### Step 2: Pull New Image

```bash
# Pull specific version
docker pull ghcr.io/github/github-mcp-server:main

# Or pull specific release
docker pull ghcr.io/github/github-mcp-server:v0.26.1
```

### Step 3: Test

```bash
npm run dev -- run examples/github-create-issue.yaml
```

## Checking What Version You're Using

```bash
# See what image you have locally
docker images | grep github-mcp-server

# Check what's in your config
cat ~/.hackflow/mcp-servers.json | grep github-mcp-server
```

## Troubleshooting Upstream Issues

### Scenario: GitHub MCP Server breaks due to upstream changes

**What happened:**
- GitHub API changes
- GitHub MCP Server breaks
- Team pushes fix to `main` branch
- No release yet

**Solution:**

1. **Switch to main branch:**
   ```bash
   # Edit ~/.hackflow/mcp-servers.json
   # Change: ghcr.io/github/github-mcp-server
   # To:     ghcr.io/github/github-mcp-server:main
   ```

2. **Pull latest main:**
   ```bash
   docker pull ghcr.io/github/github-mcp-server:main
   ```

3. **Test it works:**
   ```bash
   npm run dev -- run examples/github-create-issue.yaml
   ```

4. **When release comes out, switch back:**
   ```bash
   # Edit config back to:
   # ghcr.io/github/github-mcp-server
   
   docker pull ghcr.io/github/github-mcp-server:latest
   ```

## Finding Available Versions

### Check GitHub Releases
https://github.com/github/github-mcp-server/releases

### Check Docker Tags
https://github.com/github/github-mcp-server/pkgs/container/github-mcp-server

### List Local Images
```bash
docker images ghcr.io/github/github-mcp-server
```

## Clean Up Old Images

```bash
# Remove old images to save space
docker image prune

# Remove specific version
docker rmi ghcr.io/github/github-mcp-server:v0.25.0
```

## Best Practices

### For Development
- Use `:main` to get latest features
- Update frequently: `docker pull ghcr.io/github/github-mcp-server:main`

### For Production
- Pin to specific version: `:v0.26.1`
- Test new versions before upgrading
- Keep notes on which version works

### For Quick Fixes
- Switch to `:main` when bugs are fixed upstream
- Switch back to stable release when available
- Monitor GitHub repo for releases

## Example: Handling Today's Issue

**Problem:** Upstream bug broke GitHub MCP Server at 3:00 PM

**Solution:**
1. GitHub team pushed fix to `main` at 3:15 PM
2. Changed config to use `:main` tag
3. Pulled latest image: `docker pull ghcr.io/github/github-mcp-server:main`
4. Workflows work again! ✅
5. When v0.27.0 releases with the fix, switch back to latest release

## Alternative: Build from Source

If Docker registry is having issues, you can build locally:

```bash
# Clone the repo
git clone https://github.com/github/github-mcp-server.git
cd github-mcp-server

# Build the Docker image
docker build -t github-mcp-server-local .

# Update config to use local image
# Change: ghcr.io/github/github-mcp-server:main
# To:     github-mcp-server-local
```

Then update your config:
```json
{
  "github": {
    "command": "docker",
    "args": [
      "run",
      "-i",
      "--rm",
      "-e",
      "GITHUB_PERSONAL_ACCESS_TOKEN",
      "github-mcp-server-local"
    ],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
    }
  }
}
```

## Quick Reference

| Use Case | Image Tag | Command |
|----------|-----------|---------|
| **Stable** | None (latest) | `docker pull ghcr.io/github/github-mcp-server` |
| **Latest fixes** | `:main` | `docker pull ghcr.io/github/github-mcp-server:main` |
| **Pin version** | `:v0.26.1` | `docker pull ghcr.io/github/github-mcp-server:v0.26.1` |
| **Local build** | Custom name | `docker build -t my-name .` |

## Current Configuration

Your current config uses: **`:main`** (latest code from main branch)

This gives you the latest fixes immediately after they're merged! 🚀
