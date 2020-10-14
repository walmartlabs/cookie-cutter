/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import * as config from "../config";
import { CsvMessageEncoder, JsonMessageEncoder } from "../defaults";
import { IMessageEncoder } from "../model";

describe("Primitive Values", () => {
    interface IConfig {
        readonly str?: string;
        readonly num?: number;
        readonly bool?: boolean;
        readonly size?: number;
        readonly timeout?: number;
        readonly timeout2?: number;
        readonly color?: Colors;
        readonly mode?: Mode;
    }

    enum Colors {
        Red = 1,
        Green = 2,
    }

    enum Mode {
        Default = "d",
        Advanced = "a",
    }

    const Default: IConfig = {
        num: 5,
        color: Colors.Green,
        mode: Mode.Advanced,
    };

    @config.section
    class Config implements IConfig {
        @config.field(config.converters.string)
        public set str(_: string) {
            config.noop();
        }
        public get str(): string {
            return config.noop();
        }

        @config.field(config.converters.number)
        public set num(_: number) {
            config.noop();
        }
        public get num(): number {
            return config.noop();
        }

        @config.field(config.converters.boolean)
        public set bool(_: boolean) {
            config.noop();
        }
        public get bool(): boolean {
            return config.noop();
        }

        @config.field(config.converters.bytes)
        public set size(_: number) {
            config.noop();
        }
        public get size(): number {
            return config.noop();
        }

        @config.field(config.converters.timespan)
        public set timeout(_: number) {
            config.noop();
        }
        public get timeout(): number {
            return config.noop();
        }

        @config.field(config.converters.timespanOf(config.TimeSpanTargetUnit.Seconds))
        public set timeout2(_: number) {
            config.noop();
        }
        public get timeout2(): number {
            return config.noop();
        }

        @config.field(config.converters.enum(Colors))
        public set color(_: Colors) {
            config.noop();
        }
        public get color(): Colors {
            return config.noop();
        }

        @config.field(config.converters.enum(Mode))
        public set mode(_: Mode) {
            config.noop();
        }
        public get mode(): Mode {
            return config.noop();
        }
    }

    interface ITimes {
        readonly millisecondsToDays?: number;
        readonly hoursToSeconds?: number;
        readonly minutesToHours?: number;
        readonly millisecondsToMinutes?: number;
        readonly hoursToMinutes?: number;
        readonly secondsToSeconds?: number;
    }

    @config.section
    class Times implements ITimes {
        @config.field(
            config.converters.timespanOf(
                config.TimeSpanTargetUnit.Days,
                config.TimeSpanTargetUnit.Milliseconds
            )
        )
        public get millisecondsToDays(): number {
            return config.noop();
        }
        public set millisecondsToDays(_: number) {
            config.noop();
        }

        @config.field(
            config.converters.timespanOf(
                config.TimeSpanTargetUnit.Seconds,
                config.TimeSpanTargetUnit.Hours
            )
        )
        public get hoursToSeconds(): number {
            return config.noop();
        }
        public set hoursToSeconds(_: number) {
            config.noop();
        }

        @config.field(
            config.converters.timespanOf(
                config.TimeSpanTargetUnit.Hours,
                config.TimeSpanTargetUnit.Minutes
            )
        )
        public get minutesToHours(): number {
            return config.noop();
        }
        public set minutesToHours(_: number) {
            config.noop();
        }

        @config.field(
            config.converters.timespanOf(
                config.TimeSpanTargetUnit.Minutes,
                config.TimeSpanTargetUnit.Milliseconds
            )
        )
        public get millisecondsToMinutes(): number {
            return config.noop();
        }
        public set millisecondsToMinutes(_: number) {
            config.noop();
        }

        @config.field(
            config.converters.timespanOf(
                config.TimeSpanTargetUnit.Minutes,
                config.TimeSpanTargetUnit.Hours
            )
        )
        public get hoursToMinutes(): number {
            return config.noop();
        }
        public set hoursToMinutes(_: number) {
            config.noop();
        }

        @config.field(
            config.converters.timespanOf(
                config.TimeSpanTargetUnit.Seconds,
                config.TimeSpanTargetUnit.Seconds
            )
        )
        public get secondsToSeconds(): number {
            return config.noop();
        }
        public set secondsToSeconds(_: number) {
            config.noop();
        }
    }

    it("parses empty object", () => {
        const actual = config.parse(Config, {}, {});
        expect(actual.str).toBeUndefined();
        expect(actual.size).toBeUndefined();
        expect(actual.num).toBeUndefined();
        expect(actual.timeout).toBeUndefined();
    });

    it("parses correctly typed values", () => {
        const actual = config.parse(
            Config,
            {
                str: "hello",
                num: 1,
                bool: true,
            },
            Default
        );

        expect(actual.str).toBe("hello");
        expect(actual.num).toBe(1);
        expect(actual.bool).toBeTruthy();
    });

    it("throws error for unknown configuration values", () => {
        const actualFn = () => config.parse(Config, { foo: "bar" }, Default);
        expect(actualFn).toThrowError();
    });

    it("persists default values", () => {
        const actual = config.parse(Config, {}, Default);
        expect(actual.num).toBe(5);
        expect(actual.color).toBe(Colors.Green);
        expect(actual.mode).toBe(Mode.Advanced);
    });

    it("allows overwriting default values with <null>", () => {
        const actual = config.parse(Config, { num: null }, { num: 5 });
        expect(actual.num).toBeNull();
    });

    it("converts string -> number", () => {
        const actual = config.parse(
            Config,
            {
                num: "1",
            },
            Default
        );

        expect(actual.num).toBe(1);
    });

    it("converts string -> boolean", () => {
        const cases = [
            ["true", true],
            ["false", false],
            ["1", true],
            ["0", false],
            ["on", true],
            ["off", false],
        ];

        for (const c of cases) {
            const actual = config.parse(
                Config,
                {
                    bool: c[0],
                },
                Default
            );

            expect(actual.bool).toBe(c[1]);
        }
    });

    it("converts bytes -> number", () => {
        const cases = [
            [null, null],
            [1024, 1024],
            ["1024", 1024],
            ["1k", 1024],
            ["1KB", 1024],
            ["1.2KB", 1229],
            ["1MiB", 1048576],
        ];

        for (const c of cases) {
            const actual = config.parse(
                Config,
                {
                    size: c[0],
                },
                Default
            );

            expect(actual.size).toBe(c[1]);
        }
    });

    it("converts timespan -> number", () => {
        const cases = [
            [null, null],
            [1000, 1000],
            ["1m", 60 * 1000],
            ["10s", 10 * 1000],
            ["0.5h", 30 * 60 * 1000],
        ];

        for (const c of cases) {
            const actual = config.parse(
                Config,
                {
                    timeout: c[0],
                    timeout2: c[0],
                },
                Default
            );

            expect(actual.timeout).toBe(c[1]);
            expect(actual.timeout2).toBe(c[1] && (c[1] as number) / 1000);
        }
    });

    it("converts timespan -> number with different target and source units", () => {
        const input: ITimes = {
            millisecondsToDays: 2 * 24 * 60 * 60 * 1000,
            hoursToSeconds: 1,
            minutesToHours: 3 * 60,
            millisecondsToMinutes: 2 * 60 * 1000,
            hoursToMinutes: 2.5,
            secondsToSeconds: 13,
        };

        const expected: ITimes = {
            millisecondsToDays: 2,
            hoursToSeconds: 60 * 60,
            minutesToHours: 3,
            millisecondsToMinutes: 2,
            hoursToMinutes: 2.5 * 60,
            secondsToSeconds: 13,
        };

        const actual = config.parse(Times, input, {});

        expect(actual.millisecondsToDays).toBe(expected.millisecondsToDays);
        expect(actual.hoursToSeconds).toBe(expected.hoursToSeconds);
        expect(actual.minutesToHours).toBe(expected.minutesToHours);
        expect(actual.millisecondsToMinutes).toBe(expected.millisecondsToMinutes);
        expect(actual.hoursToMinutes).toBe(expected.hoursToMinutes);
        expect(actual.secondsToSeconds).toBe(expected.secondsToSeconds);
    });

    it("converts string -> numeric enum", () => {
        const cases = [
            [null, null],
            ["Red", Colors.Red],
            ["Green", Colors.Green],
            ["red", Colors.Red],
        ];

        for (const c of cases) {
            const actual = config.parse(
                Config,
                {
                    color: c[0],
                },
                Default
            );

            expect(actual.color).toBe(c[1]);
        }
    });

    it("converts string -> string enum", () => {
        const cases = [
            [null, null],
            ["Default", Mode.Default],
            ["Advanced", Mode.Advanced],
            ["default", Mode.Default],
        ];

        for (const c of cases) {
            const actual = config.parse(
                Config,
                {
                    mode: c[0],
                },
                Default
            );

            expect(actual.mode).toBe(c[1]);
        }
    });
});

describe("Arrays", () => {
    interface IConfig {
        readonly str?: string[];
        readonly num?: number[];
    }

    const Default: IConfig = {
        num: [],
    };

    @config.section
    class Config implements IConfig {
        @config.field(config.converters.listOf(config.converters.string))
        public set str(_: string[]) {
            config.noop();
        }
        public get str(): string[] {
            return config.noop();
        }

        @config.field(config.converters.listOf(config.converters.number))
        public set num(_: number[]) {
            config.noop();
        }
        public get num(): number[] {
            return config.noop();
        }
    }

    it("parses empty object", () => {
        const actual = config.parse(Config, {}, {});
        expect(actual.str).toBeUndefined();
        expect(actual.num).toBeUndefined();
    });

    it("preserves default", () => {
        const actual = config.parse(Config, {}, Default);
        expect(actual.num).toMatchObject([]);
    });

    it("parses object with proper type", () => {
        const actual = config.parse(Config, { str: ["1", "2"] }, Default);
        expect(actual.str).toMatchObject(["1", "2"]);
    });

    it("converts string -> string[]", () => {
        const actual = config.parse(Config, { str: "1, 2" }, Default);
        expect(actual.str).toMatchObject(["1", "2"]);
    });

    it("converts string -> number[]", () => {
        const actual = config.parse(Config, { num: "1, 2" }, Default);
        expect(actual.num).toMatchObject([1, 2]);
    });
});

describe("Sections", () => {
    interface IRootConfig {
        readonly num?: number;
        readonly sub?: ISubSection;
    }

    interface ISubSection {
        readonly str?: string;
    }

    const Default: IRootConfig = {
        sub: {
            str: "hello",
        },
    };

    @config.section
    @config.extensible
    class SubSection implements ISubSection {
        @config.field(config.converters.string)
        public set str(_: any) {
            config.noop();
        }
        public get str(): any {
            return config.noop();
        }
    }

    @config.section
    class RootConfig implements IRootConfig {
        @config.field(config.converters.number)
        public set num(_: number) {
            config.noop();
        }
        public get num(): number {
            return config.noop();
        }

        @config.field<ISubSection>(SubSection)
        public set sub(_: ISubSection) {
            config.noop();
        }
        public get sub(): ISubSection {
            return config.noop();
        }
    }

    it("parses empty object and preserves defaults", () => {
        const actual = config.parse(RootConfig, {}, Default);
        expect(actual.num).toBeUndefined();
        expect(actual.sub).toBeTruthy();
        expect(actual.sub.str).toBe("hello");
    });

    it("applies value provided", () => {
        const actual = config.parse(RootConfig, { sub: { str: "test" } }, Default);
        expect(actual.sub).toBeTruthy();
        expect(actual.sub.str).toBe("test");
    });
});

describe("Extensibility", () => {
    interface IConfig {
        readonly host: string;
        readonly port: number;
        readonly encoder: IMessageEncoder;
        readonly [key: string]: any;
    }

    const Default: IConfig = {
        host: "localhost",
        port: 5001,
        encoder: new JsonMessageEncoder(),
        ["max.payload-size"]: 100,
    };

    @config.section
    @config.extensible
    class Config implements IConfig {
        @config.field(config.converters.string)
        public set host(_: string) {
            config.noop();
        }
        public get host(): string {
            return config.noop();
        }

        @config.field(config.converters.number)
        public set port(_: number) {
            config.noop();
        }
        public get port(): number {
            return config.noop();
        }

        @config.field(config.converters.none)
        public set encoder(_: IMessageEncoder) {
            config.noop();
        }
        public get encoder(): IMessageEncoder {
            return config.noop();
        }

        readonly [key: string]: any;
    }

    it("parses empty configuration and preserves defaults", () => {
        const actual = config.parse(Config, {}, Default);
        expect(actual.host).toBe("localhost");
        expect(actual.port).toBe(5001);
        expect(actual.encoder).toBeInstanceOf(JsonMessageEncoder);
        expect(actual["max.payload-size"]).toBe(100);
    });

    it("accepts arbitrary configuration values", () => {
        const actual = config.parse(
            Config,
            {
                encoder: new CsvMessageEncoder([], "", ""),
                ["max.payload-size"]: 200,
                ["timeout"]: 50,
            },
            Default
        );
        expect(actual.encoder).toBeInstanceOf(CsvMessageEncoder);
        expect(actual["max.payload-size"]).toBe(200);
        expect(actual.timeout).toBe(50);
    });
});

describe("Inheritance", () => {
    interface IBaseConfig {
        readonly num: number;
    }

    interface ISubConfig {
        readonly b: boolean;
    }

    @config.section
    class BaseConfig implements IBaseConfig {
        @config.field(config.converters.timespan)
        public set num(_: number) {
            config.noop();
        }
        public get num(): number {
            return config.noop();
        }
    }

    @config.section
    class SubConfig extends BaseConfig implements ISubConfig {
        @config.field(config.converters.boolean)
        public set b(_: boolean) {
            config.noop();
        }
        public get b(): boolean {
            return config.noop();
        }
    }

    it("parses fields on base and sub configuration", () => {
        const actual = config.parse(SubConfig, {
            num: "1s",
            b: "on",
        });

        expect(actual.num).toBe(1000);
        expect(actual.b).toBe(true);
    });
});
