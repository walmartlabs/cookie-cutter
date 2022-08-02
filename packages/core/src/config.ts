/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import ms = require("ms");
import { isArray, isBoolean, isFunction, isNullOrUndefined, isNumber, isString } from "util";
import { IClassType } from "./model";

export type ValueConvertFn = (val: any) => any;

export function section<T extends new (...args: any[]) => {}>(TConstructor: T) {
    // https://github.com/microsoft/TypeScript/issues/37157
    const tempClass = class extends TConstructor {
        constructor(...args: any[]) {
            super(args);

            if (!Object.getOwnPropertyDescriptor(this, "__assignedProperties")) {
                Object.defineProperty(this, "__assignedProperties", {
                    enumerable: false,
                    writable: false,
                    value: new Set<string>(),
                });
            }

            if (!Object.getOwnPropertyDescriptor(this, "__values")) {
                Object.defineProperty(this, "__values", {
                    enumerable: false,
                    writable: false,
                    value: {},
                });
            }
        }
    };
    Object.defineProperty(tempClass, "name", { value: TConstructor.name });
    return tempClass;
}

export function extensible<T extends new (...args: any[]) => {}>(TConstructor: T) {
    // https://github.com/microsoft/TypeScript/issues/37157
    const tempClass = class extends TConstructor {
        constructor(...args: any[]) {
            super(args);
            if (!Object.getOwnPropertyDescriptor(this, "__extensible")) {
                Object.defineProperty(this, "__extensible", {
                    enumerable: false,
                    writable: false,
                    value: true,
                });
            }
        }
    };
    Object.defineProperty(tempClass, "name", { value: TConstructor.name });
    return tempClass;
}

export function parse<T>(TRoot: IClassType<T>, actual: any, base?: Partial<T>): T {
    function apply(target: T & ISection, source: any): void {
        for (const key of Object.keys(source)) {
            target[key] = source[key];
            if (!target.__extensible && !target.__assignedProperties.has(key)) {
                throw new Error(`unexpected configuration name '${key}'`);
            }
        }
    }

    if (isSection(actual)) {
        throw new Error(
            "The value of `actual` has no enumerable properties. Make sure the object being " +
                "passed is not the output of `config.parse<T>()` (i.e. does not have the '@section' decorator)."
        );
    }

    const instance = new TRoot();
    if (verifyIsSection(instance)) {
        const config: T & ISection = new TRoot() as any;
        apply(config, base || {});
        apply(config, actual || {});
        return config;
    }
}

export function noop(): any {
    return null;
}

export function field<T>(TSection: new () => T);
export function field(convertFn: ValueConvertFn);
export function field<T>(sectionOrConvertFn: (new () => T) | ValueConvertFn) {
    return function (_: any, propertyKeyName: string, descriptor: TypedPropertyDescriptor<T>) {
        descriptor.set = function (value: any) {
            if (verifyIsSection(this)) {
                const self: ISection = this;
                if (isValueConvertFn(sectionOrConvertFn)) {
                    const convertFn: ValueConvertFn = sectionOrConvertFn;
                    const converted = convertFn(value);
                    if (converted !== undefined) {
                        self.__values[propertyKeyName] = converted;
                    }
                    self.__assignedProperties.add(propertyKeyName);
                } else {
                    const subSection = new sectionOrConvertFn();
                    if (verifyIsSection(subSection)) {
                        for (const key of Object.keys(value)) {
                            subSection[key] = value[key];
                            if (
                                !subSection.__extensible &&
                                !subSection.__assignedProperties.has(key)
                            ) {
                                throw new Error(`unexpected configuration name '${key}'`);
                            }
                        }
                        self.__values[propertyKeyName] = subSection;
                        self.__assignedProperties.add(propertyKeyName);
                    }
                }
            }
        };
        descriptor.get = function (): any {
            if (verifyIsSection(this)) {
                return this.__values[propertyKeyName];
            }
        };
    };
}

export enum TimeSpanTargetUnit {
    Milliseconds = 1,
    Seconds = 2,
    Minutes = 3,
    Hours = 4,
    Days = 5,
}

export const converters = {
    none: (val: any): any => val,
    listOf: (itemConverter: ValueConvertFn, separator: string = ","): ValueConvertFn => {
        return function (val: any): any {
            let items: any[];
            if (isNullOrUndefined(val)) {
                items = [];
            } else if (isString(val)) {
                items = val
                    .split(separator)
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0);
            } else if (isArray(val)) {
                items = val;
            } else {
                throw new Error(`unable to convert '${val}' of type '${typeof val}' to array`);
            }

            for (let i = 0; i < items.length; i++) {
                items[i] = itemConverter(items[i]);
            }

            return items;
        };
    },
    enum: (TEnum: any): ValueConvertFn => {
        return function (val: any): any {
            if (isNullOrUndefined(val)) {
                return val;
            }

            if (isNumber(val)) {
                return val;
            }

            if (!isString(val)) {
                throw new Error(`unable to convert '${val}' of type '${typeof val}' to enum`);
            }

            let match = Object.keys(TEnum).filter((key) => key.toLowerCase() === val.toLowerCase());

            if (match.length === 0) {
                match = Object.values(TEnum).filter(
                    (v) => isString(v) && v.toLowerCase() === val.toLowerCase()
                ) as string[];

                if (match.length === 0) {
                    throw new Error(
                        `unable to convert '${val}' of type '${typeof val}' to enum (unknown element)`
                    );
                }

                return match[0];
            }

            return TEnum[match[0]];
        };
    },
    number: (val: any): any => {
        if (isNullOrUndefined(val) || isNumber(val)) {
            return val;
        } else if (isString(val)) {
            return parseFloat(val);
        }

        throw new Error(`unable to convert '${val}' of type '${typeof val}' to number`);
    },
    string: (val: any): any => {
        if (isNullOrUndefined(val)) {
            return val;
        }

        return val.toString();
    },
    bytes: (val: any): any => {
        const lookup = [
            [["B", "Byte", "Bytes", "bytes"], 1],
            [["k", "K", "kb", "KB", "KiB", "Ki", "ki"], 1024],
            [["m", "M", "mb", "MB", "MiB", "Mi", "mi"], Math.pow(1024, 2)],
            [["g", "G", "gb", "GB", "GiB", "Gi", "gi"], Math.pow(1024, 3)],
            [["t", "T", "tb", "TB", "TiB", "Ti", "ti"], Math.pow(1024, 4)],
            [["p", "P", "pb", "PB", "PiB", "Pi", "pi"], Math.pow(1024, 5)],
            [["e", "E", "eb", "EB", "EiB", "Ei", "ei"], Math.pow(1024, 6)],
        ];

        if (isNullOrUndefined(val)) {
            return val;
        }

        const parsed = val.toString().match(/^([0-9\.,]*)(?:\s*)?(.*)$/);
        const amount = parseFloat(parsed[1]);
        const unit = parsed[2];

        if (!unit) {
            return amount;
        }

        for (const row of lookup) {
            const suffixes = row[0] as string[];
            if (suffixes.indexOf(unit) >= 0) {
                return Math.round(amount * (row[1] as number));
            }
        }

        throw new Error(`unable to convert '${val}' of type '${typeof val}' to bytes`);
    },
    timespan: (val: any): any => converters.timespanOf(TimeSpanTargetUnit.Milliseconds)(val),
    timespanOf: (
        target: TimeSpanTargetUnit,
        source: TimeSpanTargetUnit = TimeSpanTargetUnit.Milliseconds
    ): ValueConvertFn => {
        return function (val: any): any {
            if (isNullOrUndefined(val)) {
                return val;
            }

            if (target < TimeSpanTargetUnit.Milliseconds || target > TimeSpanTargetUnit.Days) {
                throw new Error(`unknown target unit '${target}'`);
            }

            if (source < TimeSpanTargetUnit.Milliseconds || source > TimeSpanTargetUnit.Days) {
                throw new Error(`unknown target unit '${source}'`);
            }
            //                         x  ms    s   m   h   d
            const conversionFactors = [0, 1, 1000, 60, 60, 24];

            let sourceTime = 0;
            if (isNumber(val)) {
                sourceTime = val;
            } else if (isString(val)) {
                sourceTime = ms(val);
                source = TimeSpanTargetUnit.Milliseconds;
            } else {
                throw new Error(`unable to convert '${val}' of type '${typeof val}' to timespan`);
            }

            if (source === target) {
                return sourceTime;
            } else if (source > target) {
                let convertedTime = sourceTime;
                // skip the conversion factor for the smallest unit in the chain
                for (let ii = target + 1; ii <= source; ii++) {
                    convertedTime = convertedTime * conversionFactors[ii];
                }
                return convertedTime;
            } else if (source < target) {
                let convertedTime = sourceTime;
                // skip the conversion factor for the smallest unit in the chain
                for (let ii = source + 1; ii <= target; ii++) {
                    convertedTime = convertedTime / conversionFactors[ii];
                }
                return Math.floor(convertedTime);
            }
        };
    },
    boolean: (val: any): any => {
        if (isNullOrUndefined(val) || isBoolean(val)) {
            return val;
        }

        if (isNumber(val)) {
            return val !== 0;
        } else if (isString(val)) {
            return ["true", "yes", "on", "1"].indexOf(val.toLowerCase()) >= 0;
        }

        throw new Error(`unable to convert '${val}' of type '${typeof val}' to boolean`);
    },
};

interface ISection {
    readonly __assignedProperties: Set<string>;
    readonly __values: any;
    readonly __extensible?: boolean;
}

function isSection(obj: any): obj is ISection {
    return obj && obj.__assignedProperties;
}

function verifyIsSection(obj: any): obj is ISection {
    if (isSection(obj)) {
        return true;
    }

    throw new Error("unexpected type, are you missing the '@section' decorator?");
}

function isValueConvertFn(obj: any): obj is ValueConvertFn {
    return !(isFunction(obj) && Object.getPrototypeOf(obj).name.length > 0);
}
