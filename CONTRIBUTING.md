# Contributing to QRAGY

Thank you for your interest in contributing to QRAGY! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js 18 or later
- npm or yarn
- Git

### Local Setup

1. Fork the repository and clone your fork:
   ```bash
   git clone https://github.com/<your-username>/qragy.git
   cd qragy
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to `http://localhost:3000`.

## Submitting Issues

- Search existing issues before opening a new one to avoid duplicates.
- Use a clear, descriptive title.
- Include steps to reproduce the problem, expected behavior, and actual behavior.
- Add screenshots or logs when applicable.
- Label the issue appropriately (bug, feature request, question, etc.).

## Submitting Pull Requests

1. Create a new branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your changes and test them locally.
3. Commit your changes following the commit message format below.
4. Push to your fork and open a pull request against `main`.
5. Fill in the PR template with a summary of your changes and any related issues.
6. Wait for a review. Address any feedback promptly.

### PR Checklist

- [ ] Code builds and runs without errors.
- [ ] Changes are tested manually or with automated tests.
- [ ] No unrelated changes are included.
- [ ] Commit messages follow the format below.

## Code Style Guidelines

- **Language:** Vanilla JavaScript on the frontend, Node.js on the backend.
- Use `const` and `let`; avoid `var`.
- Use template literals instead of string concatenation.
- Keep functions small and focused on a single responsibility.
- Use meaningful variable and function names.
- Add comments only when the intent is not obvious from the code itself.
- Use 2-space indentation.
- End files with a newline.
- Remove unused imports and dead code before committing.

## Commit Message Format

Follow the conventional commit format:

```
type(scope): description
```

**Types:** `feat`, `fix`, `refactor`, `style`, `docs`, `test`, `chore`

**Examples:**
```
feat(qr): add batch QR code generation
fix(api): resolve timeout on large payloads
docs: update contributing guide
refactor(scanner): simplify camera initialization logic
```

Keep the subject line under 72 characters. Use the imperative mood ("add feature", not "added feature").

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
