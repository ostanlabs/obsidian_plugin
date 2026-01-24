# Contributing to Canvas Project Manager

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Ways to Contribute

- **Bug Reports**: Report issues you encounter
- **Feature Requests**: Suggest new features or improvements
- **Code Contributions**: Submit bug fixes or new features
- **Documentation**: Improve or expand documentation

## Getting Started

For development setup, see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

### Contribution Workflow

1. **Fork and clone** the repository
2. **Create a feature branch**: `git checkout -b feature/your-feature-name`
3. **Make your changes** following the code style guidelines below
4. **Test your changes**: `npm test && npm run lint`
5. **Commit** using conventional commits format
6. **Push and create a Pull Request**

## Code Style

### TypeScript Guidelines

- **Type Everything**: Use explicit types, avoid `any`
- **Interfaces Over Types**: Prefer interfaces for object shapes
- **Async/Await**: Use async/await over raw Promises
- **Error Handling**: Always catch and handle errors appropriately

### Code Organization

- **Modular**: Keep files focused and single-purpose
- **DRY**: Extract common logic into utilities
- **Naming**: Use descriptive names
- **Comments**: Explain "why", not "what"

### Example

```typescript
/**
 * Generates a unique ID for a structured item
 * @param prefix - ID prefix (e.g., "T" for tasks)
 * @param existingIds - Set of IDs already in use
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

## Bug Reports

Before reporting:
1. Check existing issues for duplicates
2. Test on latest version
3. Check console for errors (`Ctrl/Cmd+Shift+I`)

Include in your report:
- Clear description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Environment (Obsidian version, OS)
- Console errors if any

## Feature Requests

Before requesting:
1. Check existing issues/discussions
2. Consider if it fits the plugin's scope

Include in your request:
- Feature description
- Use case / why it's needed
- Proposed solution

## Pull Request Process

### PR Checklist

- [ ] Code follows style guidelines
- [ ] Tests added for new functionality
- [ ] All tests pass (`npm test`)
- [ ] Code linted (`npm run lint`)
- [ ] CHANGELOG.md updated

### Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: fix bug in X
docs: update README
refactor: restructure Y
test: add tests for Z
chore: update dependencies
```

### Review Process

1. Automated checks must pass
2. Maintainer reviews code
3. Address any requested changes
4. Once approved, will be merged

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing! 🎉
