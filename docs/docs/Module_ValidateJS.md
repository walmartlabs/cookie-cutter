---
id: module-validatejs
title: ValidateJS
---

The ValidateJS package can be used to setup input and output message validation by defining constraints according to validatejs' syntax (see https://validatejs.org/#examples). Constraints have to be named following a convention to be effective. The convention is based on the input message's type, it must be `{TypeName}Constraint`.

```typescript
const MyConstraints = {
    InputAConstraint: {
        fieldA: required,
        fieldB: required,
    },
    OutputAConstraint: {
        fieldC: required,
        fieldD: required,
    },
}

Application.create()
    // ...
    .validate(withValidateJs(MyConstraints))
    .dispatch({
        onInputA: (msg: IInputA, ctx: IDispatchContext) {
            ctx.publish(OutputA, { /* payload */ });
        },
    })
    .run();
```
