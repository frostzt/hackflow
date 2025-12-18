# UX Improvements - MCP Defaults

## 🎯 Changes Made

### Before

```bash
# Had to specify --mcp real every time
hackflow run workflow.yaml --mcp real

# Mock was default (annoying for production use)
hackflow run workflow.yaml  # Used mock
```

### After

```bash
# Real MCP is now default!
hackflow run workflow.yaml  # Uses real (or falls back to mock)

# Only use --mock-mcp for development
hackflow run workflow.yaml --mock-mcp  # Explicit mock mode
```

## 🏗️ How It Works Now

### Smart Hybrid Mode (Default)

```
1. User runs: hackflow run workflow.yaml

2. System tries to use real MCP servers
   ↓
3. Checks if ~/.hackflow/mcp-servers.json exists
   ↓
4a. If YES → Uses real MCP servers
4b. If NO  → Falls back to mock servers automatically
   ↓
5. Per-server fallback:
   - Git configured? → Use real git
   - GitHub not configured? → Use mock github
   ↓
6. Workflow runs! (Either way, it works)
```

### Benefits

1. **Production-Ready by Default**: No need for `--mcp real` flag
2. **Graceful Degradation**: Missing config → auto-falls back to mock
3. **Per-Server Fallback**: Some real, some mock - no problem!
4. **Clear Messaging**: User knows what's happening
5. **Better UX**: Works out of the box, scales to production

## 📋 User Experience Flow

### New User (No Config)

```bash
$ hackflow run workflow.yaml

[MCP] Using real MCP servers
[MCP] Configure servers in ~/.hackflow/mcp-servers.json
[MCP] ℹ️  No MCP config found - using mock servers
[MCP]    Create ~/.hackflow/mcp-servers.json to use real MCP servers
[MCP]    Example: cp .hackflow/mcp-servers.json.example ~/.hackflow/mcp-servers.json

🚀 Running workflow...
[INFO] Hello, World!
✓ Workflow completed successfully
```

**Result**: Works immediately! User can start using Hackflow.

### User Adds Config

```bash
$ cat > ~/.hackflow/mcp-servers.json << EOF
{
  "git": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-git"]
  }
}
EOF

$ hackflow run workflow.yaml

[MCP] Using real MCP servers
[MCP] Configure servers in ~/.hackflow/mcp-servers.json
[MCP] Connecting to git...
[MCP] ✓ Connected to real server: git

🚀 Running workflow...
[Actual git operations happen!]
✓ Workflow completed successfully
```

**Result**: Now using real Git! No code changes, just added config.

### Developer Testing

```bash
$ hackflow run workflow.yaml --mock-mcp

[MCP] Using mock MCP servers (development mode)

🚀 Running workflow...
[Mock operations - safe testing]
✓ Workflow completed successfully
```

**Result**: Fast, safe testing with mock servers.

## 🎨 Smart Fallback Examples

### Example 1: Partial Configuration

**Config** (only git configured):
```json
{
  "git": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-git"]
  }
}
```

**Workflow**:
```yaml
mcps_required:
  - git
  - github  # Not configured

steps:
  - action: git.commit     # Uses REAL git
  - action: github.create_pr  # Uses MOCK github
```

**Result**: Real git operations, mock github. Perfect for testing!

### Example 2: All Configured

**Config**:
```json
{
  "git": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-git"]
  },
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"
    }
  }
}
```

**Result**: All real operations. Production ready!

### Example 3: No Configuration

**Result**: All mock operations. Still works, safe for learning.

## 📊 Comparison

| Aspect | Before | After |
|--------|---------|-------|
| Default | Mock | Real (with fallback) |
| Production use | `--mcp real` every time | Just `hackflow run` |
| No config | Fails or uses mock | Auto-falls back to mock |
| Mixed config | Not possible | Some real, some mock |
| Developer testing | Default (mock) | `--mock-mcp` flag |
| User experience | Confusing | Intuitive |
| Setup required | None (but limited) | Optional (for real ops) |

## 🚀 Migration Guide

### For Existing Users

**Old way**:
```bash
hackflow run workflow.yaml --mcp real
```

**New way**:
```bash
# Just remove the flag!
hackflow run workflow.yaml
```

**If you want mock** (rare):
```bash
hackflow run workflow.yaml --mock-mcp
```

### For New Users

**Step 1**: Start using immediately
```bash
hackflow run examples/hello-world.yaml --var name=Alice
# Works with mock servers
```

**Step 2**: When ready for real operations
```bash
# Copy example config
cp .hackflow/mcp-servers.json.example ~/.hackflow/mcp-servers.json

# Edit to add your API keys
vim ~/.hackflow/mcp-servers.json

# Run - now uses real servers!
hackflow run workflow.yaml
```

## 💡 Design Decisions

### Why Real by Default?

1. **Intuitive**: Users expect real operations
2. **Production-ready**: No flag needed for real use
3. **Safe**: Falls back if not configured
4. **Scalable**: Easy path from learning → production

### Why Hybrid Mode?

1. **Graceful degradation**: Works without config
2. **Progressive enhancement**: Add config as needed
3. **Per-server flexibility**: Mix real and mock
4. **Better error handling**: Clear messages

### Why Keep Mock?

1. **Fast development**: No network calls
2. **Offline work**: No dependencies
3. **Safe testing**: Can't break things
4. **Predictable**: Same responses every time

## 🎯 Result

**Before**: Developers had to specify `--mcp real` for production use. Annoying!

**After**: Real MCP by default, with smart fallback. Perfect UX!

```bash
# The way it should be:
hackflow run workflow.yaml  # Just works! ✨
```

---

**Real by default. Mock when needed. Always works.** 🚀
