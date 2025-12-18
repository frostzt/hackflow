# Template Engine - Type Preservation

## Overview

Hackflow's template engine intelligently preserves data types when interpolating variables. This is crucial for working with APIs that expect specific types (booleans, numbers, etc.).

## The Problem

When you use `"{{variable}}"` in a workflow, should it always become a string? Or preserve the original type?

**Example Problem:**
```yaml
- action: prompt.confirm
  params:
    message: "Create as draft?"
  output: draft  # Returns boolean: true or false

- action: github.create_pull_request
  params:
    draft: "{{draft}}"  # Should be boolean, not string!
```

GitHub's API expects `draft` to be a boolean (`true` or `false`), not a string (`"true"` or `"false"`).

## The Solution

Hackflow's template engine **preserves types** for pure variable references:

### Pure Variable Reference
When the entire value is a single variable: `"{{variable}}"`

```yaml
params:
  draft: "{{draft}}"         # If draft=true  → true (boolean)
  count: "{{count}}"         # If count=42   → 42 (number)
  enabled: "{{enabled}}"     # If enabled=false → false (boolean)
```

**Result:** The actual value is used, preserving its original type.

### String Interpolation
When variables are mixed with text: `"Hello {{name}}"`

```yaml
params:
  message: "Title: {{title}}"           # → "Title: My PR" (string)
  url: "https://{{domain}}/{{path}}"    # → "https://example.com/api" (string)
```

**Result:** Always returns a string.

## Examples

### Example 1: Boolean Parameters

```yaml
# Workflow steps
- action: prompt.confirm
  params:
    message: "Enable feature?"
  output: feature_enabled

- action: api.update_settings
  params:
    enabled: "{{feature_enabled}}"  # ✅ Preserves boolean
```

**What happens:**
- User answers "yes" → `feature_enabled = true` (boolean)
- Template interpolates → `enabled: true` (boolean, not "true")
- API receives correct boolean type ✅

### Example 2: Number Parameters

```yaml
- action: prompt.ask
  params:
    message: "How many items?"
  output: count_input

- action: variable.set
  params:
    name: count
    value: 10  # Stored as number

- action: api.create_batch
  params:
    count: "{{count}}"  # ✅ Preserves number
```

**Result:** API receives `count: 10` (number), not `count: "10"` (string)

### Example 3: Mixed Usage

```yaml
- action: prompt.confirm
  output: is_draft

- action: prompt.ask
  output: title

- action: github.create_pull_request
  params:
    draft: "{{is_draft}}"              # Boolean preserved
    title: "{{title}}"                 # String preserved
    body: "Draft: {{is_draft}}"        # String (mixed content)
    label: "priority-{{priority}}"     # String (mixed content)
```

**Results:**
- `draft: true` (boolean) ✅
- `title: "My Feature"` (string) ✅
- `body: "Draft: true"` (string - "true" becomes text) ✅
- `label: "priority-high"` (string) ✅

## Type Detection Rules

| Pattern | Example | Result | Type |
|---------|---------|--------|------|
| Pure variable | `"{{draft}}"` | `true` | Original type preserved |
| Pure variable | `"{{count}}"` | `42` | Original type preserved |
| With prefix | `"Draft: {{draft}}"` | `"Draft: true"` | String |
| With suffix | `"{{count}} items"` | `"42 items"` | String |
| Multiple vars | `"{{a}}-{{b}}"` | `"foo-bar"` | String |

**Rule:** If the template is **exactly** `"{{variable}}"` (nothing before or after), the original value is used. Otherwise, string interpolation is performed.

## Common Use Cases

### GitHub API Parameters

```yaml
# Boolean parameters
- action: github.create_pull_request
  params:
    draft: "{{is_draft}}"                    # boolean
    maintainer_can_modify: "{{allow_edits}}" # boolean

# Number parameters  
- action: github.list_issues
  params:
    per_page: "{{page_size}}"  # number
```

### Conditional Logic

```yaml
- action: prompt.confirm
  output: skip_tests

- action: test.run
  if: "{{skip_tests}} == false"  # Boolean comparison works!
  params:
    suite: "integration"
```

### MCP Tool Parameters

```yaml
- action: some.tool
  params:
    enabled: "{{feature_enabled}}"      # boolean
    timeout: "{{timeout_seconds}}"      # number
    max_retries: "{{retry_count}}"      # number
    description: "Timeout: {{timeout_seconds}}s"  # string
```

## Why This Matters

### ❌ Without Type Preservation

```yaml
params:
  draft: "{{is_draft}}"  # is_draft = true

# API receives: { draft: "true" }  ← String!
# API expects:  { draft: true }    ← Boolean!
# Result: API error or unexpected behavior
```

### ✅ With Type Preservation

```yaml
params:
  draft: "{{is_draft}}"  # is_draft = true

# API receives: { draft: true }   ← Boolean!
# API expects:  { draft: true }   ← Boolean!
# Result: Works perfectly! ✅
```

## Implementation Details

The template engine checks if a string value is a pure variable reference:

```typescript
// Check if this is "{{variable}}" (pure variable)
const pureVarMatch = obj.match(/^\{\{([^}]+)\}\}$/);

if (pureVarMatch) {
  // Return the actual value (preserves type)
  return context[variable];
} else {
  // Perform string interpolation
  return stringWithInterpolatedValues;
}
```

## Testing Type Preservation

You can verify types are preserved correctly:

```yaml
- action: variable.set
  params:
    name: test_bool
    value: true

- action: variable.set
  params:
    name: test_num
    value: 42

- action: log.info
  params:
    message: |
      Boolean: {{test_bool}}
      Number: {{test_num}}
      Mixed: Value is {{test_bool}}
```

## Best Practices

### ✅ DO: Use pure variable references for API parameters

```yaml
params:
  draft: "{{is_draft}}"
  count: "{{item_count}}"
```

### ✅ DO: Use string interpolation for display text

```yaml
params:
  message: "Creating {{count}} items..."
  title: "[{{status}}] {{title}}"
```

### ❌ DON'T: Mix types unnecessarily

```yaml
# Bad - forces string conversion
params:
  draft: "{{is_draft}} "  # Extra space forces string!

# Good - pure reference
params:
  draft: "{{is_draft}}"
```

### ❌ DON'T: Manually convert types

```yaml
# Not needed - types are preserved!
- action: variable.set
  params:
    name: draft_bool
    value: "{{is_draft}}"  # Already preserves boolean

# This is unnecessary:
- action: variable.set
  params:
    name: draft_bool
    value: "{{is_draft}} == true"  # Don't do this!
```

## Related Issues

This fix resolves:
- GitHub PR `draft` parameter sending string instead of boolean
- Numeric parameters being treated as strings
- Conditional logic with boolean variables
- Any API that expects strict type matching

## Summary

**Pure variable references** (`"{{var}}"`) → **Preserve original type**
**String interpolation** (`"text {{var}}"`) → **Always string**

This intelligent behavior makes workflows more reliable and easier to write! 🎉
