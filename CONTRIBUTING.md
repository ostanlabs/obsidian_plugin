# Contributing to Canvas Accomplishments

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## 🎯 Ways to Contribute

- **Bug Reports**: Report issues you encounter
- **Feature Requests**: Suggest new features or improvements
- **Code Contributions**: Submit bug fixes or new features
- **Documentation**: Improve or expand documentation
- **Testing**: Help test new features and report feedback

## 🚀 Getting Started

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/obsidian_plugin.git
   cd obsidian_plugin
   ```

2. **Install Dependencies**
   ```bash
   make install
   # or: npm install
   ```

3. **Build the Plugin**
   ```bash
   make build
   # or: npm run build
   ```

4. **Link to Test Vault**
   ```bash
   make deploy VAULT_PATH=/path/to/test/vault
   ```

5. **Start Development Mode**
   ```bash
   make dev
   # This will watch for changes and rebuild automatically
   ```

### Development Workflow

1. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**
   - Write clean, documented code
   - Follow existing code style
   - Add tests for new functionality

3. **Test Your Changes**
   ```bash
   make test        # Run tests
   make lint        # Check code style
   make format      # Auto-format code
   ```

4. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

5. **Push and Create PR**
   ```bash
   git push origin feature/your-feature-name
   ```
   Then create a Pull Request on GitHub

## 📝 Code Style

### TypeScript Guidelines

- **Type Everything**: Use explicit types, avoid `any`
- **Interfaces Over Types**: Prefer interfaces for object shapes
- **Async/Await**: Use async/await over raw Promises
- **Error Handling**: Always catch and handle errors appropriately

### Code Organization

- **Modular**: Keep files focused and single-purpose
- **DRY**: Don't repeat yourself - extract common logic
- **Naming**: Use descriptive names (no single letters except loop counters)
- **Comments**: Explain "why", not "what" (code should be self-documenting)

### File Structure

```
util/           # Pure utility functions (no plugin dependencies)
ui/             # UI components and modals
notion/         # Notion API integration
tests/          # Test files (mirror src structure)
```

### Example Code Style

```typescript
/**
 * Generates a unique ID for a structured item
 * @param prefix - ID prefix (e.g., "T" for tasks)
 * @param existingIds - Set of IDs already in use
 * @param padding - Number of digits for zero-padding
 * @returns New unique ID (e.g., "T001")
 */
export function generateUniqueId(
  prefix: string,
  existingIds: Set<string>,
  padding: number = 3
): string {
  let counter = 1;
  let id: string;
  
  do {
    id = `${prefix}${counter.toString().padStart(padding, '0')}`;
    counter++;
  } while (existingIds.has(id));
  
  return id;
}
```

## 🧪 Testing

### Writing Tests

- **Unit Tests**: Test individual functions in isolation
- **Integration Tests**: Test component interactions
- **Coverage**: Aim for >80% code coverage
- **Edge Cases**: Test boundary conditions and error cases

### Test Structure

```typescript
describe('generateUniqueId', () => {
  it('should generate ID with correct prefix', () => {
    const id = generateUniqueId('T', new Set(), 3);
    expect(id).toMatch(/^T\d{3}$/);
  });
  
  it('should skip existing IDs', () => {
    const existing = new Set(['T001', 'T002']);
    const id = generateUniqueId('T', existing, 3);
    expect(id).toBe('T003');
  });
});
```

### Running Tests

```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report
```

## 📚 Documentation

### Code Documentation

- **JSDoc Comments**: Document all public functions
- **Type Annotations**: Self-document with good types
- **Inline Comments**: Explain complex logic

### User Documentation

- **README**: Keep main README up-to-date
- **Feature Docs**: Create separate docs for major features
- **Changelog**: Update CHANGELOG.md with all changes

## 🐛 Bug Reports

### Before Reporting

1. Check existing issues for duplicates
2. Test on latest version
3. Try to reproduce in a clean vault
4. Check console for errors (Ctrl/Cmd+Shift+I)

### Report Template

```markdown
**Description**
Clear description of the bug

**Steps to Reproduce**
1. Go to...
2. Click on...
3. See error...

**Expected Behavior**
What should happen

**Actual Behavior**
What actually happens

**Environment**
- Obsidian Version: X.X.X
- Plugin Version: X.X.X
- OS: macOS/Windows/Linux

**Console Errors**
```
Paste any console errors here
```

**Screenshots**
If applicable
```

## ✨ Feature Requests

### Before Requesting

1. Check existing issues/discussions
2. Consider if it fits the plugin's scope
3. Think about implementation approach

### Request Template

```markdown
**Feature Description**
What feature you'd like to see

**Use Case**
Why this feature is needed

**Proposed Solution**
How you envision it working

**Alternatives Considered**
Other approaches you've thought about

**Additional Context**
Any other relevant information
```

## 🔄 Pull Request Process

### PR Checklist

- [ ] Code follows style guidelines
- [ ] Tests added for new functionality
- [ ] All tests pass (`make test`)
- [ ] Code linted and formatted (`make lint && make format`)
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Commits follow conventional commits format

### Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: fix bug in X
docs: update README
style: format code
refactor: restructure Y
test: add tests for Z
chore: update dependencies
```

Examples:
```
feat: add batch conversion for canvas nodes
fix: prevent race condition in canvas updates
docs: add troubleshooting section for Notion sync
refactor: extract canvas manipulation to utility module
test: add integration tests for note creation
```

### PR Review Process

1. **Automated Checks**: All CI checks must pass
2. **Code Review**: Maintainer will review code
3. **Feedback**: Address any requested changes
4. **Approval**: Once approved, will be merged
5. **Release**: Changes included in next release

## 🤝 Community Guidelines

### Be Respectful

- Treat everyone with respect and kindness
- Welcome newcomers and help them learn
- Provide constructive feedback
- Assume good intentions

### Communication

- **GitHub Issues**: Bug reports and feature requests
- **Pull Requests**: Code contributions
- **Discussions**: Questions and general discussion

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 🙏 Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Credited in relevant documentation

## ❓ Questions?

- **General Questions**: Open a GitHub Discussion
- **Bug Reports**: Open an issue
- **Private Matters**: Contact maintainers directly

---

Thank you for contributing to Canvas Accomplishments! 🎉

