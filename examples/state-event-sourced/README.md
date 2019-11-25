# Event Sourced State

This example demonstrates how to use Cookie Cutter to manage event sourced state. It uses the in-memory event sourced state providers that ship with Cookie Cutter's core package. 

## How to Run

```bash
yarn start
```

## Output

```
2019-09-12T16:52:52.039Z |  INFO | starting Cookie Cutter service | version=1.2.0-beta.0 | serviceName=@examples/state-event-sourced | serviceVersion=0.0.0
2019-09-12T16:52:52.055Z |  INFO | creating new user jdoe | event_type=Signup
2019-09-12T16:52:52.058Z |  INFO | creating new cart 29ae31978494b2a3fdb10ef18cf0709e for user jdoe | event_type=PutInCart
2019-09-12T16:52:52.059Z |  INFO | adding cookies to cart 29ae31978494b2a3fdb10ef18cf0709e | event_type=PutInCart
2019-09-12T16:52:52.059Z |  INFO | adding soap to cart 29ae31978494b2a3fdb10ef18cf0709e | event_type=PutInCart
2019-09-12T16:52:52.060Z |  INFO | closing cart 29ae31978494b2a3fdb10ef18cf0709e | event_type=Checkout
2019-09-12T16:52:52.060Z |  INFO | placing order with total = 9.29 | event_type=Checkout
2019-09-12T16:52:52.061Z | ERROR | user jdoe already exists | event_type=Signup
2019-09-12T16:52:52.061Z |  INFO | creating new cart e64c9886b52f3993b435606137011e0a for user jdoe | event_type=PutInCart
2019-09-12T16:52:52.062Z |  INFO | adding gum to cart e64c9886b52f3993b435606137011e0a | event_type=PutInCart
2019-09-12T16:52:52.161Z |  INFO | shutting down

content of storage Map {
  'jdoe' => [ { type: 'UserCreated', payload: [Object] },
  { type: 'CartCreated', payload: [Object] },
  { type: 'ItemAddedToCart', payload: [Object] },
  { type: 'ItemAddedToCart', payload: [Object] },
  { type: 'CartClosed', payload: [Object] },
  { type: 'OrderPlaced', payload: [Object] },
  { type: 'CartCreated', payload: [Object] },
  { type: 'ItemAddedToCart', payload: [Object] } ] }
```
