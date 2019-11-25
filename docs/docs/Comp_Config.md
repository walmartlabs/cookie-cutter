---
id: comp-config
title: Config
---

The configuration subsystem allows modules to be configured in a more human-readable way and automatically map human-readable strings to the data types required in the module. This works especially well in combination with the popular `config` module (https://github.com/lorenwest/node-config) and environment variables.

## Example

The example below allows the user to configure a list of numbers as a comma-separated string in an environment variable and the configuration subsystem will automatically parse that string into an array of numbers.

```typescript
// node-config dependency
import * as cfg from "config";

export interface IMyConfiguration {
    readonly numbers: number[];
}

@config.section
class MyConfiguration implements IMyConfiguration {
    @config.field(@config.converts.listOf(@config.converts.number))
    public get numbers(): number[] { return config.noop(); }
    public set numbers(value: numbers[]) { config.noop(); }
}

export function createMyInputSource(configuration: IMyConfiguration): IInputSource {
    configuration = config.parse(MyConfiguration, configuration);
    console.log(configuration.numbers);
    return ...;
}

Application.create()
    .input()
        .add(createMyInputSource())
        .done()
    // ...
    .run();
```

```json
default.json
{
    "app": {
        "numbers": "1,2,3",
    }
}

custom-environment-variables.json
{
    "app": {
        "numbers": "NUMBERS",
    }
}
```

```bash
export NUMBERS="1,2,3,4" node index.js
>>>  [1, 2, 3, 4]
```

## Sections and Fields

For each configuration interface a corresponding class needs to be implemented that is decorated with `@config.section` and `@config.field` markers. Those markers will automatically generate the implementations for all getter and setter functions. The call to `config.noop()` as shown in the above example has no effect, it is only required to satisfy the compiler and linter. Nested configurations can be defined with subsections as follows:

```typescript
interface IMyRootConfig {
    readonly nested: IMyNestedConfig;
}

interface IMyNestedConfig {
    readonly endpoint: string;
}

@config.section
class MyRootConfig implements IMyRootConfig {
    @config.field(MyNestedConfig)
    public get nested(): IMyNestedConfig { return config.noop(); }
    public set nested(value: IMyNestedConfig) { config.noop(); }
}

@config.section
class MyRootConfig implements IMyRootConfig {
    @config.field(config.converters.string)
    public get endpoint(): string { return config.noop(); }
    public set endpoint(value: string) { config.noop(); }
}
```

## Default Configurations

The `config.parse` function accepts an optional 3rd parameter for default configuration values that will be used for keys not present in the 2nd argument object.

```typescript
import * as cfg from "config";

interface IMyConfiguration {
    readonly retryOnError: boolean;
}

class MyConfiguration implements IMyConfiguration {
    @config.field(config.converters.boolean)
    public get retryOnError(): boolean { return config.noop(); }
    public set retryOnError(value: boolean) { config.noop(); }
}

config.parse(MyConfiguration, cfg.get("app"), {
    // the default value if not explicitly overwritten by cfg.get("app")
    retryOnError: true,
});
```

## Built-In Type Converters

### none

Will perform no conversion and assign exactly the value that was passed in. This is mainly useful for fields that must be configured in code and the values do not originate from an environment variable or config file.

```typescript
interface IMyConfiguration {
    readonly encoder: IMessageEncoder;
}

class MyConfiguration implements IMyConfiguration {
    @config.field(config.converters.none)
    public get encoder(): IMessageEncoder { return config.noop(); }
    public set encoder(value: IMessageEncoder) { config.noop(); }
}
```

### boolean

Converts strings to boolean flags. Accepted values that convert to `true` are `"true"`, `"yes"`, `"on"`, `"1"` (case insensitive).

```typescript
interface IMyConfiguration {
    readonly featureToggle: boolean;
}

class MyConfiguration implements IMyConfiguration {
    @config.field(config.converters.boolean)
    public get featureToggle(): boolean { return config.noop(); }
    public set featureToggle(value: boolean) { config.noop(); }
}
```

### timespan / timespanOf

Converts a string representing a duration into a number of the specified base unit. `timespan` is short for `timespanOf(TimeSpanTargetUnit.Milliseconds)`. Accepted values are strings like `"1 min"`, `"1h"`, `"100ms"`, `"1s"`. If the string is a number without a unit suffix it will be interpreted as the base unit passed to `timespanOf`.

```typescript
interface IMyConfiguration {
    readonly timeout: number;
}

class MyConfiguration implements IMyConfiguration {
    @config.field(config.converters.timespan)
    public get timeout(): number { return config.noop(); }
    public set timeout(value: number) { config.noop(); }
}
```

### bytes

This converter translates a string to a number of bytes. Examples for accepted values are `"1 MB"`, `"100k"`, `"7KiB"`, etc.

```typescript
interface IMyConfiguration {
    readonly maxPayloadSize: number;
}

class MyConfiguration implements IMyConfiguration {
    @config.field(config.converters.bytes)
    public get maxPayloadSize(): number { return config.noop(); }
    public set maxPayloadSize(value: number) { config.noop(); }
}
```

### string + number

Converts a string to a number / ensures a value is a string, e.g. "123" -> 123

```typescript
interface IMyConfiguration {
    readonly port: number;
    readonly host: string;
}

class MyConfiguration implements IMyConfiguration {
    @config.field(config.converters.number)
    public get port(): number { return config.noop(); }
    public set port(value: number) { config.noop(); }

    @config.field(config.converters.string)
    public get host(): string { return config.noop(); }
    public set host(value: string) { config.noop(); }
}
```

### enum

Converts the key of an enum to its corresponding value. Valid values for the example below would be `"Red"`, `"Green"`, `"Blue"`, `"red"`, `"green"`, ...

```typescript
enum Color {
    Red,
    Green,
    Blue
}

interface IMyConfiguration {
    readonly color: Color;
}

class MyConfiguration implements IMyConfiguration {
    @config.field(config.converters.enum(Color))
    public get color(): Color { return config.noop(); }
    public set color(value: Color) { config.noop(); }
}
```

### listOf

Converts a comma separated list of values into an array and converts each value within the array to its target type. For example the string `"1, 2, 3"` would be converted into an array and each value within will be converted from string to number.

```typescript
interface IMyConfiguration {
    readonly numbers: number[];
}

class MyConfiguration implements IMyConfiguration {
    @config.field(config.converters.listOf(config.converters.number))
    public get numbers(): number[] { return config.noop(); }
    public set numbers(value: number[]) { config.noop(); }
}
```

You may optionally specify the separator character as the 2nd argument of `listOf` - the default value is `,`.