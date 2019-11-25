---
id: comp-validation
title: Validation
---

Cookie Cutter supports the validation of input and output messages to prevent processing or publishing/storing of bad messages.

```typescript
export interface IValidateResult {
    readonly success: boolean;
    readonly message?: string;
}

export interface IMessageValidator {
    validate(msg: IMessage): IValidateResult;
}
```

A message validator can be hooked up at the root of an `Application`.

```typescript
Application.create()
    .validate(new MyMessageValidator())
    // ...
    .run();
```

The `validate` function will be invoked for every message emitted from an input source and it will only be dispatched to a message handler if the validation result indicates a valid message. The same concept applies to all published/stored messages - however if a single input message results in multiple messages published or stored it will not publish or store anything if at least one of the output messages is invalid.