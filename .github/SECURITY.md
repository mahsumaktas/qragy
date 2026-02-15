# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in Qragy, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email: **security@qragy.dev** (or open a private security advisory on GitHub)

### What to include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline:
- **Acknowledgment**: Within 48 hours
- **Assessment**: Within 1 week
- **Fix release**: As soon as possible, typically within 2 weeks

## Security Best Practices for Deployment

1. **Always set `ADMIN_TOKEN`** in production to protect the admin panel
2. **Never commit `.env` files** - use `.env.example` as a template
3. **Keep Node.js updated** to the latest LTS version
4. **Use HTTPS** in production (Cloudflare Tunnel, nginx, or reverse proxy)
5. **Rate limiting** is enabled by default - do not disable in production
