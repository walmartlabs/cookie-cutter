/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

// ---------- COMMANDS ----------

export class Signup {
    public constructor(public readonly userId: string) {}
}

export class PutInCart {
    public constructor(
        public readonly userId: string,
        public readonly product: string,
        public readonly price: number
    ) {}
}

export class Checkout {
    public constructor(public readonly userId: string, public readonly paymentDetails: string) {}
}

// ---------- EVENTS ----------

export class UserCreated {
    public constructor(public readonly userId: string) {}
}

export class CartCreated {
    public constructor(public readonly cartId: string) {}
}

export class ItemAddedToCart {
    public constructor(
        public readonly cartId: string,
        public readonly product: string,
        public readonly price: number
    ) {}
}

export class CartClosed {
    public constructor(public readonly cartId: string) {}
}

export class OrderPlaced {
    public constructor(
        public readonly products: string[],
        public readonly total: number,
        public readonly paymentDetails: string
    ) {}
}

// ---------- STATE ----------

export interface IUserStateSnapshot {
    userId: string;
    activeCart: {
        id: string;
        items: {
            product: string;
            price: number;
        }[];
    };
}

export class UserState {
    public activeCart: CartState | undefined;
    public userId: string | undefined;

    public constructor(snapshot?: IUserStateSnapshot) {
        if (snapshot) {
            this.userId = snapshot.userId;
            if (snapshot.activeCart) {
                this.activeCart = new CartState();
                this.activeCart.id = snapshot.activeCart.id;
                this.activeCart.items = snapshot.activeCart.items;
            }
        }
    }

    public hasActiveCart(): boolean {
        return this.activeCart !== undefined;
    }

    public snap(): IUserStateSnapshot {
        return {
            userId: this.userId,
            activeCart: this.activeCart && {
                id: this.activeCart.id,
                items: this.activeCart.items.map((i) => ({
                    product: i.product,
                    price: i.price,
                })),
            },
        };
    }
}

export class CartState {
    public id: string | undefined;
    public items: { product: string; price: number }[] = [];
}

// ---------- AGGREGATION ----------

export class UserStateAggregator {
    public onUserCreated(msg: UserCreated, state: UserState): void {
        state.userId = msg.userId;
    }

    public onCartCreated(msg: CartCreated, state: UserState): void {
        state.activeCart = new CartState();
        state.activeCart.id = msg.cartId;
    }

    public onCartClosed(_: CartClosed, state: UserState): void {
        state.activeCart = undefined;
    }

    public onItemAddedToCart(msg: ItemAddedToCart, state: UserState): void {
        state.activeCart.items.push({ product: msg.product, price: msg.price });
    }
}
