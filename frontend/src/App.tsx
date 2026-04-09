import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Client, Session, Socket } from '@heroiclabs/nakama-js';
import './App.css';
import { Logo } from './components/Logo';
import confetti from 'canvas-confetti';
import gsap from 'gsap';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GameState {
  board: (string | null)[];
  currentPlayer: string;
  players: { [userId: string]: string };
  winner: string | null;
  gameOver: boolean;
  moveCount: number;
}

interface StoredSession {
  username: string;
  userId: string;
  deviceId: string;
}

type GamePhase = 'login' | 'lobby' | 'loading' | 'playing' | 'abandoned';

const STORAGE_KEY = 'tictactoe_session';

// ─── Preloader ────────────────────────────────────────────────────────────────

interface PreloaderProps {
  onComplete: () => void;
}

const Preloader: React.FC<PreloaderProps> = ({ onComplete }) => {
  const logoRef    = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.set(logoRef.current,    { opacity: 1, scale: 1 });
    gsap.set(overlayRef.current, { opacity: 1 });

    const tl = gsap.timeline();

    // hold at full opacity for 0.8s so render/assets can settle
    tl.to({}, { duration: 0.8 })

    // pulse 1 — slow fade to 0, instant snap back to 1
      .to(logoRef.current,  { opacity: 0, duration: 1.4, ease: 'sine.inOut' })
      .set(logoRef.current, { opacity: 1 })

  

    // hold a beat then expand + fade out
      .to(logoRef.current, {
        scale: 3.5,
        opacity: 0,
        duration: 0.7,
        ease: 'power2.in',
        delay: 0.25,
      })

    // overlay dissolves
      .to(overlayRef.current, {
        opacity: 0,
        duration: 0.4,
        ease: 'power2.out',
        onComplete,
      }, '-=0.2');

    return () => { tl.kill(); };
  }, [onComplete]);

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#0a0a0f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'all',
      }}
    >
      <div
        ref={logoRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          willChange: 'transform, opacity',
        }}
      >
        <Logo size="large" />
      </div>
    </div>
  );
};

// ─── App ──────────────────────────────────────────────────────────────────────

const App: React.FC = () => {
  const [showPreloader, setShowPreloader]         = useState(true);

  const [client, setClient]                       = useState<Client | null>(null);
  const [session, setSession]                     = useState<Session | null>(null);
  const [socket, setSocket]                       = useState<Socket | null>(null);
  const [match, setMatch]                         = useState<any>(null);
  const [gameState, setGameState]                 = useState<GameState | null>(null);
  const [username, setUsername]                   = useState('');
  const [isConnecting, setIsConnecting]           = useState(false);
  const [error, setError]                         = useState<string | null>(null);
  const [mySymbol, setMySymbol]                   = useState<string>('');
  const [myUserId, setMyUserId]                   = useState<string>('');
  const [gamePhase, setGamePhase]                 = useState<GamePhase>('login');
  const [loadingProgress, setLoadingProgress]     = useState(0);
  const [abandonedBy, setAbandonedBy]             = useState<string | null>(null);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [isInitializing, setIsInitializing]       = useState(true);

  const handlePreloaderComplete = useCallback(() => {
    setShowPreloader(false);
  }, []);

  const playWinSound = () => {
    const audio = new Audio('/sounds/youWin.mp3');
    audio.volume = 0.5;
    audio.play().catch(() => {});
  };

  const playLoseSound = () => {
    const audio = new Audio('/sounds/youLost.mp3');
    audio.volume = 0.5;
    audio.play().catch(() => {});
  };

  const launchFireworks = () => {
    const duration     = 3000;
    const animationEnd = Date.now() + duration;
    const rng = (min: number, max: number) => Math.random() * (max - min) + min;
    const interval = setInterval(() => {
      if (Date.now() > animationEnd) { clearInterval(interval); return; }
      confetti({ startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999, particleCount: 50, origin: { x: rng(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999, particleCount: 50, origin: { x: rng(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);
  };

  const sadConfetti = () => {
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#808080', '#404040', '#606060'], gravity: 2, scalar: 0.8 });
  };

  useEffect(() => {
    const host   = process.env.REACT_APP_NAKAMA_HOST || 'localhost';
    const port   = process.env.REACT_APP_NAKAMA_PORT || '7350';
    const useSSL = process.env.REACT_APP_NAKAMA_SSL === 'true';

    const nakamaClient = new Client('defaultkey', host, port, useSSL);
    setClient(nakamaClient);

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed: StoredSession = JSON.parse(stored);
        setUsername(parsed.username);
        setMyUserId(parsed.userId);
        reconnectWithDeviceId(nakamaClient, parsed.deviceId);
      } catch {
        setIsInitializing(false);
      }
    } else {
      setIsInitializing(false);
    }
  }, []);

  const reconnectWithDeviceId = async (nakamaClient: Client, deviceId: string) => {
    try {
      const newSession = await nakamaClient.authenticateDevice(deviceId, false);
      setSession(newSession);
      setMyUserId(newSession.user_id || '');
      const newSocket = nakamaClient.createSocket(false);
      await newSocket.connect(newSession, true);
      setSocket(newSocket);
      setGamePhase('lobby');
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setIsInitializing(false);
    }
  };

  const connectToNakama = async () => {
    if (!client || !username) return;
    setIsConnecting(true);
    setError(null);
    try {
      const deviceId   = `${username}-${crypto.randomUUID()}`;
      const newSession = await client.authenticateDevice(deviceId, true);
      setSession(newSession);
      setMyUserId(newSession.user_id || '');
      const newSocket = client.createSocket(false);
      await newSocket.connect(newSession, true);
      setSocket(newSocket);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ username, userId: newSession.user_id || '', deviceId }));
      setGamePhase('lobby');
    } catch (err) {
      setError(`Connection failed: ${err}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null); setSocket(null); setMatch(null); setGameState(null);
    setUsername(''); setMyUserId(''); setGamePhase('login');
    setMySymbol(''); setOpponentConnected(false);
  };

  const findMatch = async () => {
    if (!client || !session || !socket) return;
    setError(null);
    setGamePhase('loading');
    setLoadingProgress(0);
    setOpponentConnected(false);

    const interval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 90) { clearInterval(interval); return 90; }
        return prev + Math.random() * 25;
      });
    }, 400);

    try {
      const result  = await client.rpc(session, 'find_match', {});
      const data    = typeof result.payload === 'string' ? JSON.parse(result.payload) : result.payload;
      const matchId = data.matchId;
      if (!matchId) {
        clearInterval(interval);
        setError('No match ID returned from server');
        setGamePhase('lobby');
        return;
      }
      const joinedMatch = await socket.joinMatch(matchId);
      setMatch(joinedMatch);
    } catch (err: any) {
      clearInterval(interval);
      setError(`Failed to find match: ${err?.message || 'Unknown error'}`);
      setGamePhase('lobby');
    }
  };

  const goBackFromLoading = () => {
    if (socket && match) { socket.leaveMatch(match.match_id); setMatch(null); }
    setGamePhase('lobby');
    setLoadingProgress(0);
    setOpponentConnected(false);
  };

  useEffect(() => {
    if (!socket) return;

    socket.onmatchdata = (matchData) => {
      const opCode = matchData.op_code;
      const data   = JSON.parse(new TextDecoder().decode(matchData.data as unknown as ArrayBuffer));

      if (opCode === 1) {
        const prevGameState = gameState;
        setGameState(data);

        if (data.players && myUserId && data.players[myUserId]) {
          setMySymbol(data.players[myUserId]);
        }

        const playerCount = Object.keys(data.players).length;
        if (playerCount === 2 && !opponentConnected && gamePhase === 'loading') {
          setOpponentConnected(true);
          setLoadingProgress(100);
          setTimeout(() => setGamePhase('playing'), 5000);
        }

        if (data.gameOver && (!prevGameState || !prevGameState.gameOver)) {
          if (data.winner === myUserId) { launchFireworks(); playWinSound(); }
          else if (data.winner)          { sadConfetti();    playLoseSound(); }
        }
      } else if (opCode === 4) {
        if (data.error) {
          setError(data.error);
          setTimeout(() => setError(null), 3000);
        }
      }
    };

    socket.onmatchpresence = (presenceEvent) => {
      if (presenceEvent.leaves?.length > 0 && gamePhase === 'playing') {
        setAbandonedBy('opponent');
        setGamePhase('abandoned');
        if (gameState) {
          setGameState({ ...gameState, gameOver: true, winner: myUserId });
          launchFireworks();
          playWinSound();
        }
      }
    };
  }, [socket, myUserId, gameState, gamePhase, opponentConnected]);

  const makeMove = useCallback((position: number) => {
    if (!socket || !match || !gameState) return;
    if (gameState.gameOver) return;
    if (gameState.currentPlayer !== myUserId) return;
    if (gameState.board[position] !== null) return;
    socket.sendMatchState(match.match_id, 2, JSON.stringify({ position }));
  }, [socket, match, gameState, myUserId]);

  const resetGame = useCallback(() => {
    if (!socket || !match || !gameState) return;
    if (!gameState.gameOver) return;
    socket.sendMatchState(match.match_id, 3, '{}');
  }, [socket, match, gameState]);

  const leaveMatch = () => {
    if (socket && match) { socket.leaveMatch(match.match_id); setMatch(null); }
    setGameState(null); setMySymbol(''); setGamePhase('lobby');
    setAbandonedBy(null); setOpponentConnected(false);
  };

  const renderBoard = () => {
    if (!gameState) return null;
    return (
      <div className={`board ${gamePhase === 'loading' && !opponentConnected ? 'board-blur' : ''}`}>
        {gameState.board.map((cell, index) => (
          <div
            key={index}
            className={`cell ${cell ? 'filled' : ''} ${
              gamePhase === 'playing' && gameState.currentPlayer === myUserId && !cell && !gameState.gameOver
                ? 'clickable' : ''
            }`}
            onClick={() => makeMove(index)}
          >
            {cell}
          </div>
        ))}
      </div>
    );
  };

  const renderStatus = () => {
    if (!gameState) return null;
    const playerCount = Object.keys(gameState.players).length;
    if (gamePhase === 'loading' && !opponentConnected)
      return <p className="status status-searching">Searching for opponent...</p>;
    if (gamePhase === 'loading' && opponentConnected)
      return <p className="status status-found">Opponent found! Starting game...</p>;
    if (playerCount < 2) return null;
    if (gameState.gameOver) {
      if (gameState.winner === myUserId) return <p className="status status-win">Victory</p>;
      if (gameState.winner)              return <p className="status status-lose">Defeat</p>;
      return <p className="status status-draw">Draw</p>;
    }
    if (gameState.currentPlayer === myUserId)
      return <p className="status status-your-turn">Your Turn</p>;
    return <p className="status status-opponent-turn">Opponent's Turn</p>;
  };

  return (
    <>
      {showPreloader && <Preloader onComplete={handlePreloaderComplete} />}

      <div className="app">
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div className="container">

            <div className="header">
              <div className="logo-section">
                <Logo size="medium" />
                <div className="brand-text">
                  <h1 className="brand-name"><br /></h1>
                  <p className="brand-tagline">Tic-Tac-Toe</p>
                </div>
              </div>
              {session && (
                <button onClick={logout} className="btn-logout">
                  Logout
                </button>
              )}
            </div>

            {error && <div className="error-banner">{error}</div>}

            {gamePhase === 'login' && (
              <div className="card fade-in">
                <h2>Welcome</h2>
                <input
                  type="text"
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && connectToNakama()}
                  className="input"
                />
                <button
                  onClick={connectToNakama}
                  disabled={isConnecting || !username}
                  className="btn btn-primary"
                >
                  {isConnecting ? 'Connecting...' : 'Play'}
                </button>
              </div>
            )}

            {gamePhase === 'lobby' && (
              <div className="card fade-in">
                <h2>Ready to play?</h2>
                <p className="subtitle">Find an opponent and start playing</p>
                <button onClick={findMatch} className="btn btn-primary">
                  Find Match
                </button>
              </div>
            )}

            {(gamePhase === 'loading' || gamePhase === 'playing') && (
              <div className="game-wrapper fade-in">
                {renderStatus()}
                {renderBoard()}

                {gamePhase === 'loading' && !opponentConnected && (
                  <div className="loading-overlay">
                    <div className="spinner"></div>
                    <p className="loading-text">Searching...</p>
                    <button onClick={goBackFromLoading} className="btn-back-loading">
                      Back
                    </button>
                  </div>
                )}

                {gamePhase === 'playing' && gameState && (
                  <>
                    <div className="player-badge">
                      You are <strong>{mySymbol}</strong>
                    </div>
                    <div className="game-controls">
                      {gameState.gameOver && (
                        <button onClick={resetGame} className="btn btn-secondary">
                          Play Again
                        </button>
                      )}
                      <button onClick={leaveMatch} className="btn btn-danger">
                        Leave
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {gamePhase === 'abandoned' && (
              <div className="card fade-in">
                <div className="abandoned-content">
                  <h2>Opponent Left</h2>
                  <p className="abandoned-message">You win by default!</p>
                  <button onClick={leaveMatch} className="btn btn-primary">
                    Return to Lobby
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
};

export default App;