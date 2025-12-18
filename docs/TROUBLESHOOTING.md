# Troubleshooting Hackflow

Common issues and how to solve them.

## 🤖 AI Features

### "AI provider not available"

**Error Message**:

```
Error: AI provider not available. Set ANTHROPIC_API_KEY or provide AI config.
```

**Cause**: No AI API key configured

**Solution**:

```bash
# Set API key
export ANTHROPIC_API_KEY=sk-ant-your-key-here

# Then run workflow
hackflow run examples/ai-simple-demo.yaml
```

**Check if it worked**:

```bash
# Should not show "AI features disabled" message
hackflow run examples/hello-world.yaml --var name=Test
```

### Dynamic prompts not interpreting

**Symptom**: Dynamic prompts behave like static prompts

**Cause**: AI provider not configured

**Check**:

```bash
echo $ANTHROPIC_API_KEY
# Should output your key
```

**Solution**: Set environment variable (see above)

### AI actions are slow

**Cause**: Network latency or large responses

**Solutions**:

1. Reduce `max_tokens`:

```yaml
- action: ai.generate
  params:
    prompt: "..."
    max_tokens: 100 # Instead of 1000
```

2. Use faster model:

```bash
export ANTHROPIC_MODEL=claude-3-haiku-20240307
```

3. Add timeout handling:

```yaml
- action: ai.generate
  params:
    prompt: "..."
  retry:
    attempts: 2
    delay: 2000
```

## 🔧 MCP Tools

### "Tool not found on server"

**Error Message**:

```
Tool "status" not found on server "git". Available tools: stage_all, commit, push, current_branch
```

**Cause**: The mock MCP tool doesn't exist

**Available Mock Tools**:

**Git**:

- `stage_all` - Stage all changes
- `commit` - Commit with message
- `push` - Push to remote
- `current_branch` - Get current branch
- `status` - Get git status (added)
- `diff` - Get git diff (added)
- `log` - Get git log (added)

**GitHub**:

- `create_pr` - Create pull request

**Filesystem**:

- `read` - Read file
- `write` - Write file

**Solution**: Use available tools or add new mock tools

**Example Fix** - If you need `git.status`:

```yaml
# ✅ Works (tool exists)
- action: git.status
  output: status

# ❌ Doesn't work (tool doesn't exist yet)
- action: git.branch
  output: branches
```

### MCP server not connecting

**Symptom**: Workflow fails when trying to use MCP actions

**Check**:

```yaml
# Make sure server is in mcps_required
mcps_required:
  - git
  - github
```

**Note**: Currently using mock MCP tools. Real MCP integration coming in v0.2.

## 📝 Workflows

### Variable not found

**Error Message**:

```
Template variable not found: user_name. Available: name, auto_push
```

**Cause**: Using a variable that doesn't exist in context

**Solution 1**: Provide via CLI

```bash
hackflow run workflow.yaml --var user_name=Alice
```

**Solution 2**: Set in config_schema with default

```yaml
config_schema:
  user_name:
    type: string
    default: "Unknown"
```

**Solution 3**: Generate in earlier step

```yaml
steps:
  - action: prompt.ask
    params:
      message: "Enter your name"
    output: user_name # ← Creates variable

  - action: log.info
    params:
      message: "Hello {{user_name}}" # ← Uses variable
```

### Condition not working

**Symptom**: Step executes when it shouldn't (or vice versa)

**Common Issues**:

1. **Wrong comparison**:

```yaml
# ❌ Wrong
if: "{{enabled}} = true"  # Single =

# ✅ Correct
if: "{{enabled}} == true"  # Double ==
```

2. **Type mismatch**:

```yaml
# Variable is boolean, comparing as string
if: "{{enabled}} == 'true'"  # ❌ Wrong

if: "{{enabled}} == true"    # ✅ Correct
```

3. **Missing variable**:

```yaml
# Make sure variable exists before using in condition
- action: variable.set
  params:
    name: enabled
    value: true

- action: log.info
  if: "{{enabled}} == true"
  params:
    message: "Enabled!"
```

### Step always skipped

**Cause**: Condition evaluates to false

**Debug**:

```yaml
# Add log before conditional step
- action: log.info
  params:
    message: "enabled = {{enabled}}, count = {{count}}"

- action: my.action
  if: "{{enabled}} == true && {{count}} > 0"
  params: ...
```

### Workflow timeout

**Error Message**:

```
Error: Workflow timeout after 60000ms
```

**Solution 1**: Increase timeout

```yaml
name: my-workflow
timeout: 120000 # 2 minutes (in milliseconds)
steps: ...
```

**Solution 2**: Optimize slow steps

```yaml
# Add retries instead of long timeout
- action: slow.operation
  retry:
    attempts: 3
    delay: 1000
```

## 🛡️ Security

### "Path not writable"

**Error Message**:

```
Path not writable: /System/file.txt
```

**Cause**: Trying to write to protected directory

**Protected paths**:

- `/System`
- `/bin`, `/sbin`
- `/usr/bin`, `/usr/sbin`
- `/etc`
- `~/.ssh`, `~/.gnupg`

**Solution**: Write to allowed paths (current directory)

```yaml
# ❌ Won't work
- action: filesystem.write
  params:
    path: "/etc/hosts"
    content: "..."

# ✅ Works
- action: filesystem.write
  params:
    path: "./output.txt"
    content: "..."
```

### Rate limit exceeded

**Error Message**:

```
Rate limit exceeded for this action
```

**Cause**: Too many requests in short time

**Solution**: Add delays between actions

```yaml
- action: api.call
  params:
    url: "..."

- action: variable.set
  params:
    name: wait
    value: true

# Add small delay
- action: api.call
  params:
    url: "..."
  retry:
    attempts: 1
    delay: 1000 # 1 second delay
```

## 🔨 Build Issues

### TypeScript errors

**Error**: Type errors during `npm run build`

**Solution**:

```bash
# Clean and rebuild
rm -rf dist node_modules
npm install
npm run build
```

### Module not found

**Error**: `Cannot find module '@anthropic-ai/sdk'`

**Solution**:

```bash
npm install
```

### Permission denied

**Error**: `EACCES: permission denied`

**Solution**:

```bash
# If using npm link
sudo npm link

# Or use npm run dev instead
npm run dev -- run workflow.yaml
```

## 🗄️ Storage

### Database locked

**Error**: `SqliteError: database is locked`

**Cause**: Multiple Hackflow instances accessing same database

**Solution**:

1. Close other Hackflow instances
2. Wait a few seconds
3. Try again

**Or**: Use separate databases

```typescript
const storage = createStorage({
  type: "sqlite",
  path: "/path/to/custom.db",
});
```

### Execution not found

**Error**: `Execution not found: abc-123`

**Cause**: Execution ID doesn't exist or was cleaned up

**Solution**:

```bash
# List recent executions
hackflow list

# Use correct ID from list
hackflow show <correct-id>
```

## 🐛 General Debugging

### Enable verbose mode

```bash
hackflow run workflow.yaml --verbose
```

### Use dry-run mode

Test without side effects:

```bash
hackflow run workflow.yaml --dry-run
```

### Check logs

Look at step-by-step execution:

```bash
hackflow run workflow.yaml
# Each step shows: [INFO], [ERROR], etc.

hackflow show <execution-id>
# See detailed step results
```

### Test workflow piece by piece

Create a minimal test workflow:

```yaml
name: test
steps:
  - action: log.info
    params:
      message: "Step 1 works"

  # Add more steps one at a time
```

## 📦 Installation Issues

### npm install fails

**Solution**:

```bash
# Clear cache
npm cache clean --force

# Delete and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Command not found: hackflow

**After `npm link`**:

```bash
# Check if linked
npm list -g | grep hackflow

# Re-link
cd /path/to/hackflow
npm link
```

**Alternative**: Use `npm run dev` instead

```bash
npm run dev -- run workflow.yaml
```

## 🆘 Still Having Issues?

### Check the docs

- [README.md](../README.md) - Overview
- [QUICKSTART.md](../QUICKSTART.md) - Getting started
- [AI_FEATURES.md](AI_FEATURES.md) - AI documentation
- [HOW_AI_WORKS.md](HOW_AI_WORKS.md) - AI architecture

### Run example workflows

Test if examples work:

```bash
hackflow run examples/hello-world.yaml --var name=Test
hackflow run examples/git-commit-workflow.yaml --dry-run
```

### Check environment

```bash
# Node version (should be 18+)
node --version

# npm version
npm --version

# Check API key
echo $ANTHROPIC_API_KEY
```

### Report an issue

If you found a bug:

1. Check existing issues
2. Create new issue with:
   - Error message
   - Steps to reproduce
   - Environment (OS, Node version)
   - Workflow YAML (if relevant)

---

**Most common issues are resolved by**:

1. Setting `ANTHROPIC_API_KEY` environment variable
2. Using `--dry-run` to test workflows
3. Checking available MCP tools
4. Using `--verbose` for debugging
