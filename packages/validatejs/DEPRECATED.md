# ⚠️ DEPRECATED

This package is **deprecated** and no longer maintained.

## Why is it deprecated?

The underlying `validate.js` library (v0.13.1) contains a critical security vulnerability:

- **CVE-2020-26308**: Regular Expression Denial of Service (ReDoS)
- **Severity**: MEDIUM
- **Status**: ⚠️ **NO PATCH AVAILABLE** - The library is abandoned

This vulnerability allows attackers to supply specially crafted input to validation functions that would cause the application to hang or consume excessive CPU resources.

For more information, see:
- [NVD - CVE-2020-26308](https://nvd.nist.gov/vuln/detail/CVE-2020-26308)
- [Snyk Advisory](https://security.snyk.io/vuln/SNYK-JS-VALIDATEJS-8309532)

## Migration Guide

Please migrate to one of these modern, actively maintained validation libraries:

### Recommended: [Zod](https://zod.dev)
- TypeScript-first design
- Chainable, intuitive API
- Zero dependencies
- Excellent error messages

```typescript
import { z } from "zod";

const userSchema = z.object({
  name: z.string().min(1),
  age: z.number().positive()
});

type User = z.infer<typeof userSchema>;
```

### Alternative: [Joi](https://joi.dev)
- Powerful and flexible
- Great for complex validation rules
- Well-documented
- Production-ready

```typescript
import Joi from "joi";

const schema = Joi.object({
  name: Joi.string().required(),
  age: Joi.number().positive().required()
});

const { value, error } = schema.validate({ name: "John", age: 30 });
```

### Alternative: [yup](https://github.com/jquense/yup)
- Simple and lightweight
- Good integration with React forms
- Schema-based validation

```typescript
import * as yup from "yup";

const validationSchema = yup.object({
  name: yup.string().required(),
  age: yup.number().positive().required()
});
```

## Timeline

- **Maintained until**: End of 2026
- **Removed in**: v1.7.0 (planned)

Please plan your migration accordingly.
