"use strict";

var moduleName = "tictactoe";
var tickRate = 5;

function matchInit(ctx, logger, nk, params) {
    var state = {
        board: [null,null,null,null,null,null,null,null,null],
        currentPlayer: '',
        players: {},
        winner: null,
        gameOver: false,
        moveCount: 0
    };
    return {
        state: state,
        tickRate: tickRate,
        label: JSON.stringify({ open: 1 })
    };
}

function matchJoinAttempt(ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
    if (Object.keys(state.players).length >= 2) {
        return { state: state, accept: false, rejectMessage: "Match is full" };
    }
    return { state: state, accept: true };
}

function matchJoin(ctx, logger, nk, dispatcher, tick, state, presences) {
    for (var i = 0; i < presences.length; i++) {
        var presence = presences[i];
        if (Object.keys(state.players).length === 0) {
            state.players[presence.userId] = 'X';
            state.currentPlayer = presence.userId;
        } else if (Object.keys(state.players).length === 1) {
            state.players[presence.userId] = 'O';
        }
        logger.info('Player ' + presence.username + ' joined as ' + state.players[presence.userId]);
    }
    if (Object.keys(state.players).length >= 2) {
        dispatcher.matchLabelUpdate(JSON.stringify({ open: 0 }));
    }
    dispatcher.broadcastMessage(1, JSON.stringify(state), null, null);
    return { state: state };
}

function matchLeave(ctx, logger, nk, dispatcher, tick, state, presences) {
    for (var i = 0; i < presences.length; i++) {
        logger.info('Player ' + presences[i].username + ' left');
        delete state.players[presences[i].userId];
    }
    return { state: state };
}

function matchLoop(ctx, logger, nk, dispatcher, tick, state, messages) {
    for (var i = 0; i < messages.length; i++) {
        var message = messages[i];
        if (message.opCode === 2) {
            var move = JSON.parse(nk.binaryToString(message.data));
            state = processMove(state, message.sender.userId, move.position, dispatcher, logger);
        } else if (message.opCode === 3) {
            if (state.gameOver) {
                state = resetGame(state);
                dispatcher.broadcastMessage(1, JSON.stringify(state), null, null);
            }
        }
    }
    return { state: state };
}

function matchTerminate(ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
    logger.info("Match terminated");
    return { state: state };
}

function matchSignal(ctx, logger, nk, dispatcher, tick, state, data) {
    return { state: state };
}

function processMove(state, userId, position, dispatcher, logger) {
    if (state.gameOver) {
        dispatcher.broadcastMessage(4, JSON.stringify({ error: "Game is over" }), null, null);
        return state;
    }
    if (state.currentPlayer !== userId) {
        dispatcher.broadcastMessage(4, JSON.stringify({ error: "Not your turn" }), null, null);
        return state;
    }
    if (position < 0 || position > 8 || state.board[position] !== null) {
        dispatcher.broadcastMessage(4, JSON.stringify({ error: "Invalid move" }), null, null);
        return state;
    }
    state.board[position] = state.players[userId];
    state.moveCount++;
    if (checkWinner(state.board)) {
        state.winner = userId;
        state.gameOver = true;
        logger.info('Player ' + userId + ' wins!');
    } else if (state.moveCount >= 9) {
        state.gameOver = true;
        state.winner = null;
        logger.info("Game is a draw");
    } else {
        var playerIds = Object.keys(state.players);
        state.currentPlayer = playerIds[0] === userId ? playerIds[1] : playerIds[0];
    }
    dispatcher.broadcastMessage(1, JSON.stringify(state), null, null);
    return state;
}

function checkWinner(board) {
    var lines = [
        [0,1,2],[3,4,5],[6,7,8],
        [0,3,6],[1,4,7],[2,5,8],
        [0,4,8],[2,4,6]
    ];
    for (var i = 0; i < lines.length; i++) {
        var a = lines[i][0], b = lines[i][1], c = lines[i][2];
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return true;
        }
    }
    return false;
}

function resetGame(state) {
    state.board = [null,null,null,null,null,null,null,null,null];
    state.winner = null;
    state.gameOver = false;
    state.moveCount = 0;
    var playerIds = Object.keys(state.players);
    state.currentPlayer = playerIds[Math.floor(Math.random() * playerIds.length)];
    return state;
}

function rpcCreateMatch(ctx, logger, nk, payload) {
    var matchId = nk.matchCreate(moduleName, {});
    return JSON.stringify({ matchId: matchId });
}

function rpcFindMatch(ctx, logger, nk, payload) {
    var matches = nk.matchList(10, true, null, 1, 2, "+label.open:>=1");
    if (matches.length > 0) {
        return JSON.stringify({ matchId: matches[0].matchId });
    }
    var matchId = nk.matchCreate(moduleName, {});
    return JSON.stringify({ matchId: matchId });
}

function InitModule(ctx, logger, nk, initializer) {
    initializer.registerMatch(moduleName, {
        matchInit: matchInit,
        matchJoinAttempt: matchJoinAttempt,
        matchJoin: matchJoin,
        matchLeave: matchLeave,
        matchLoop: matchLoop,
        matchTerminate: matchTerminate,
        matchSignal: matchSignal
    });
    initializer.registerRpc("create_match", rpcCreateMatch);
    initializer.registerRpc("find_match", rpcFindMatch);
    logger.info("Tic-Tac-Toe module loaded");
}

globalThis.InitModule = InitModule;