/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

export interface ILabelValues {
    [key: string]: string | number;
}

interface ICounter {
    name: string;
    count: number;
    timestamp: number;
    labelObject: ILabelValues;
    increment(value: number, timestamp: number): void;
    toPrometheusString(): string;
}

interface IGauge {
    name: string;
    value: number;
    timestamp: number;
    labelObject: ILabelValues;
    set(value: number, timestamp: number): void;
    toPrometheusString(): string;
}

interface IHistogram {
    name: string;
    buckets: number[];
    bucketValues: number[];
    count: number;
    sum: number;
    labelObject: ILabelValues;
    observe(value: number): void;
    toPrometheusString(): string;
}

export interface ICounterSet {
    name: string;
    increment(prefixedKey: string, value: number, tags: ILabelValues): void;
    toPrometheusString(): string;
}

export interface IGaugeSet {
    name: string;
    set(prefixedKey: string, value: number, tags: ILabelValues): void;
    toPrometheusString(): string;
}

export interface IHistogramSet {
    name: string;
    observe(prefixedKey: string, value: number, tags: ILabelValues): void;
    toPrometheusString(): string;
}

export class CounterSet implements ICounterSet {
    private counters: Map<string, ICounter>; // map of labels string to ICounter

    constructor(public readonly name: string) {
        this.counters = new Map<string, ICounter>();
    }

    public increment(prefixedKey: string, value: number, tags: ILabelValues): void {
        const mapKey = stringFromLabelsObject(tags);
        let counter: ICounter = this.counters.get(mapKey);
        if (!counter) {
            counter = new Counter(prefixedKey, tags);
        }
        counter.increment(value, Date.now());
        this.counters.set(mapKey, counter);
    }

    public toPrometheusString(): string {
        if (this.counters.size < 1) {
            return "";
        }
        let str = `# TYPE ${this.name} counter\n`;
        for (const counter of this.counters.values()) {
            str += counter.toPrometheusString();
        }
        str += "\n";
        return str;
    }
}

export class Counter implements ICounter {
    public count: number;
    public timestamp: number;
    public labelsTag: string;

    constructor(public readonly name: string, public readonly labelObject: ILabelValues) {
        this.count = 0;
        this.timestamp = 0;
        this.labelsTag = generateLabelsTag(this.labelObject);
    }

    public increment(value: number, timestamp: number): void {
        this.count += value;
        this.timestamp = timestamp;
    }

    public toPrometheusString(): string {
        return `${this.name}${this.labelsTag} ${this.count} ${this.timestamp}\n`;
    }
}

export class GaugeSet implements IGaugeSet {
    private gauges: Map<string, IGauge>; // map of labels string to IGauge

    constructor(public readonly name: string) {
        this.gauges = new Map<string, IGauge>();
    }

    public set(prefixedKey: string, value: number, tags: ILabelValues) {
        const mapKey = stringFromLabelsObject(tags);
        let gauge: IGauge = this.gauges.get(mapKey);
        if (!gauge) {
            gauge = new Gauge(prefixedKey, tags);
        }
        gauge.set(value, Date.now());
        this.gauges.set(mapKey, gauge);
    }

    public toPrometheusString(): string {
        if (this.gauges.size < 1) {
            return "";
        }
        let str = `# TYPE ${this.name} gauge\n`;
        for (const gauge of this.gauges.values()) {
            str += gauge.toPrometheusString();
        }
        str += "\n";
        return str;
    }
}

export class Gauge implements IGauge {
    public value: number;
    public timestamp: number;
    public labelsTag: string;

    constructor(public readonly name: string, public readonly labelObject: ILabelValues) {
        this.value = 0;
        this.timestamp = 0;
        this.labelsTag = generateLabelsTag(this.labelObject);
    }

    public set(value: number, timestamp: number): void {
        this.value = value;
        this.timestamp = timestamp;
    }

    public toPrometheusString(): string {
        return `${this.name}${this.labelsTag} ${this.value} ${this.timestamp}\n`;
    }
}

export class HistogramSet implements IHistogramSet {
    private histograms: Map<string, IHistogram>; // map of labels string to IHistogram

    constructor(public readonly name: string, private readonly buckets: number[]) {
        this.histograms = new Map<string, IHistogram>();
    }

    public observe(prefixedKey: string, value: number, tags: ILabelValues) {
        const mapKey = stringFromLabelsObject(tags);
        let histogram: IHistogram = this.histograms.get(mapKey);
        if (!histogram) {
            histogram = new Histogram(prefixedKey, this.buckets, tags);
        }
        histogram.observe(value);
        this.histograms.set(mapKey, histogram);
    }

    public toPrometheusString(): string {
        if (this.histograms.size < 1) {
            return "";
        }
        let str = `# TYPE ${this.name} histogram\n`;
        for (const hist of this.histograms.values()) {
            str += hist.toPrometheusString();
        }
        str += "\n";
        return str;
    }
}

export class Histogram implements IHistogram {
    public bucketValues: number[];
    public count: number;
    public sum: number;
    public labelsTag: string;

    constructor(
        public readonly name: string,
        public readonly buckets: number[],
        public readonly labelObject: ILabelValues
    ) {
        this.bucketValues = [...buckets, 0].fill(0); // the last entry is for a bucket with 'vals <= +Inf'
        this.count = 0;
        this.sum = 0;
        this.labelsTag = generateLabelsTag(this.labelObject, true);
    }

    public observe(value: number): void {
        this.count++;
        this.sum += value;
        this.bucketValues[this.bucketValues.length - 1]++;
        for (let ii = this.buckets.length - 1; ii >= 0; ii--) {
            if (value <= this.buckets[ii]) {
                this.bucketValues[ii]++;
            } else {
                break;
            }
        }
    }

    public toPrometheusString(): string {
        // create buckets
        let bucketsStr = "";
        let ii = 0;
        for (; ii < this.buckets.length; ii++) {
            bucketsStr += `${this.name}_bucket{le="${this.buckets[ii]}"`;
            bucketsStr += this.labelsTag ? `,${this.labelsTag}` : "";
            bucketsStr += `} ${this.bucketValues[ii]}\n`;
        }
        bucketsStr += `${this.name}_bucket{le="+Inf"`;
        bucketsStr += this.labelsTag ? `,${this.labelsTag}` : "";
        bucketsStr += `} ${this.bucketValues[ii]}\n`;
        // add sum
        bucketsStr += `${this.name}_sum`;
        bucketsStr += this.labelsTag ? `{${this.labelsTag}}` : "";
        bucketsStr += ` ${this.sum}\n`;
        // add count
        bucketsStr += `${this.name}_count`;
        bucketsStr += this.labelsTag ? `{${this.labelsTag}}` : "";
        bucketsStr += ` ${this.count}\n`;
        return bucketsStr;
    }
}

function stringFromLabelsObject(labels: ILabelValues): string {
    let keys = labels ? Object.keys(labels) : [];
    let str = "";
    if (keys.length > 0) {
        str += ",";
        keys = keys.sort(); // we need to get the same string every time
        let ii = 0;
        for (; ii < keys.length - 1; ii++) {
            str += `${keys[ii]}:${labels[keys[ii]]},`;
        }
        str += `${keys[ii]}:${labels[keys[ii]]}`;
    }
    return str;
}

function generateLabelsTag(labelObject: ILabelValues, skipBraces?: boolean): string {
    const labelKeys = labelObject ? Object.keys(labelObject) : [];
    let str = "";
    if (labelKeys.length > 0) {
        str += skipBraces ? "" : "{";
        let ii = 0;
        for (; ii < labelKeys.length - 1; ii++) {
            str += `${labelKeys[ii]}="${labelObject[labelKeys[ii]]}",`;
        }
        str += `${labelKeys[ii]}="${labelObject[labelKeys[ii]]}"`;
        str += skipBraces ? "" : "}";
    }
    return str;
}
