/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { generateUniqueId, IDispatchContext } from "@walmartlabs/cookie-cutter-core";
import * as m from "./model";

export class CommandHandler {
    public async onSignup(msg: m.Signup, ctx: IDispatchContext<m.UserState>) {
        const stateRef = await ctx.state.get(msg.userId);
        if (!stateRef.isNew) {
            ctx.logger.error(`user ${msg.userId} already exists`);
        } else {
            ctx.logger.info(`creating new user ${msg.userId}`);
            ctx.store(m.UserCreated, stateRef, new m.UserCreated(msg.userId));
        }
    }

    public async onPutInCart(msg: m.PutInCart, ctx: IDispatchContext<m.UserState>) {
        const stateRef = await ctx.state.get(msg.userId);
        if (stateRef.isNew) {
            ctx.logger.error(`unknown user ${msg.userId}`);
        } else {
            let cartId = stateRef.state.activeCart && stateRef.state.activeCart.id;
            if (!stateRef.state.hasActiveCart()) {
                cartId = generateUniqueId(msg.userId, msg.product, msg.price);
                ctx.logger.info(`creating new cart ${cartId} for user ${msg.userId}`);
                ctx.store(m.CartCreated, stateRef, new m.CartCreated(cartId));
            }

            ctx.logger.info(`adding ${msg.product} to cart ${cartId}`);
            ctx.store(
                m.ItemAddedToCart,
                stateRef,
                new m.ItemAddedToCart(cartId, msg.product, msg.price)
            );
        }
    }

    public async onCheckout(msg: m.Checkout, ctx: IDispatchContext<m.UserState>) {
        const stateRef = await ctx.state.get(msg.userId);
        if (stateRef.isNew) {
            ctx.logger.error(`unknown user ${msg.userId}`);
        } else if (!stateRef.state.hasActiveCart()) {
            ctx.logger.error(`user ${msg.userId} has no open cart`);
        } else {
            const cart = stateRef.state.activeCart!;
            const total = cart.items.map((i) => i.price).reduce((p, c) => p + c, 0);
            const products = cart.items.map((i) => i.product);

            ctx.logger.info(`closing cart ${cart.id}`);
            ctx.store(m.CartClosed, stateRef, new m.CartClosed(cart.id));

            ctx.logger.info(`placing order with total = ${total}`);
            ctx.store(
                m.OrderPlaced,
                stateRef,
                new m.OrderPlaced(products, total, msg.paymentDetails)
            );
        }
    }
}
