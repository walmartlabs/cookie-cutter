/*
Copyright (c) Walmart Inc.

This source code is licensed under the Apache 2.0 license found in the
LICENSE file in the root directory of this source tree.
*/

import { createServer, Server } from "http";
import { Socket } from "net";

export class HttpServer {
    private readonly openSockets = new Map<number, Socket>();
    private nextSocketId: number = 0;
    private readonly server: Server;

    private constructor(port: number, endpoint: string, getMetrics: () => string) {
        this.server = createServer((req, res) => {
            if (req.url === endpoint) {
                res.writeHead(200, { "Content-Type": "text/plain" });
                res.write(getMetrics());
                res.end();
            } else {
                res.writeHead(404);
                res.end();
            }
        });
        this.server.on("connection", (socket: Socket) =>
            this.handleConnection(socket, this.openSockets)
        );
        this.server.listen(port);
    }

    public static create(port: number, endpoint: string, getMetrics: () => string) {
        return new HttpServer(port, endpoint, getMetrics);
    }

    public async close() {
        if (this.server) {
            this.closeOpenSockets();
            await new Promise<void>((resolve, reject) => {
                this.server.close((err: Error) => {
                    if (err) {
                        reject(err);
                    }
                    resolve();
                });
            });
        }
    }

    private closeOpenSockets() {
        for (const socket of this.openSockets.values()) {
            socket.destroy();
        }
        this.openSockets.clear();
    }

    private handleConnection(socket: Socket, openSockets: Map<number, Socket>) {
        const socketId = this.nextSocketId++;
        openSockets.set(socketId, socket);
        socket.on("close", () => this.handleClose(socketId, openSockets));
    }

    private handleClose(socketId: number, openSockets: Map<number, Socket>) {
        openSockets.delete(socketId);
    }
}
