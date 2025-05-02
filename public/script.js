// --- Globale Variabler ---
let socket = null;
let myPlayerId = null;
let currentRoomId = null;

// --- DOM Elementer ---
const connectionStatusDiv = document.getElementById('connection-status');
const roomIdInput = document.getElementById('room-id');
const playerNameInput = document.getElementById('player-name');
const joinButton = document.getElementById('join-button');
const joinErrorDiv = document.getElementById('join-error');

const connectionAreaDiv = document.getElementById('connection-area');
const gameAreaDiv = document.getElementById('game-area');
const roomDisplayH2 = document.getElementById('room-display');
const gameMessageDiv = document.getElementById('game-message');
const gameErrorDiv = document.getElementById('game-error');

const dealerCardsDiv = document.getElementById('dealer-cards');
const dealerValueSpan = document.getElementById('dealer-value');
const playersAreaDiv = document.getElementById('players-area');

const startButton = document.getElementById('start-button');
const hitButton = document.getElementById('hit-button');
const standButton = document.getElementById('stand-button');

// --- Event Listeners ---
joinButton.addEventListener('click', handleJoin);
startButton.addEventListener('click', handleStartGame);
hitButton.addEventListener('click', handleHit);
standButton.addEventListener('click', handleStand);
// Tillad Enter i input felter for at joine
roomIdInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') handleJoin(); });
playerNameInput.addEventListener('keypress', function (e) { if (e.key === 'Enter') handleJoin(); });


// --- Funktioner ---

function handleJoin() {
    const roomId = roomIdInput.value.trim();
    const playerName = playerNameInput.value.trim() || `Spiller_${Math.random().toString(36).substring(2, 6)}`; // Default navn

    if (!roomId) {
        joinErrorDiv.textContent = 'Rum ID skal udfyldes.';
        return;
    }
    if (socket && socket.connected) {
        console.log("Already connected, attempting to join room...");
         socket.emit('join_room', { roomId, playerName });
         currentRoomId = roomId; // Gem rum ID
         connectionStatusDiv.textContent = `Forbundet som ${myPlayerId}. Deltager i rum '${roomId}'...`;
        return; // Stop her hvis allerede forbundet
    }


    joinErrorDiv.textContent = ''; // Ryd fejl
    joinButton.disabled = true;
    connectionStatusDiv.textContent = `Forbinder til server og rum '${roomId}'...`;

    // VIGTIGT: Erstat med din servers lokale IP-adresse!
    // Find den ved at køre 'ipconfig' (Windows) eller 'ip addr show' / 'ifconfig' (Mac/Linux)
    // på den computer, der kører server.js. Det er typisk noget som 192.168.x.x
    // Hvis du bare tester på din EGEN maskine, kan du bruge 'http://localhost:3000'
    // const SERVER_URL = 'http://localhost:3000'; // Til test på egen maskine
    const SERVER_URL = 'http://192.168.1.166:3000'; // <--- ERSTAT MED SERVERENS LOKALE IP! F.eks. http://192.168.1.105:3000

    try {
        // Gem rum-ID og navn, så de kan bruges i 'connect' eventen
        currentRoomId = roomId;
        localStorage.setItem('blackjack_playerName', playerName); // Gem navn for nemheds skyld

        socket = io(SERVER_URL, {
            reconnectionAttempts: 3, // Prøv at genforbinde et par gange
            timeout: 5000 // Timeout for forbindelse
        });
        setupSocketListeners(); // Sæt listeners op FØR man emitter join

    } catch (error) {
        console.error("Failed to initialize socket:", error);
        connectionStatusDiv.textContent = "Fejl: Kunne ikke starte forbindelse.";
        joinButton.disabled = false;
        socket = null;
    }
}

function setupSocketListeners() {
    if (!socket) return;

    socket.on('connect', () => {
        myPlayerId = socket.id; // Få spillerens unikke ID fra serveren
        console.log('Forbundet til server med ID:', myPlayerId);

        // Prøv at hente gemt navn
        const playerName = localStorage.getItem('blackjack_playerName') || `Spiller_${myPlayerId.substring(0,4)}`;
        playerNameInput.value = playerName; // Opdater input feltet

        connectionStatusDiv.textContent = `Forbundet! ID: ${myPlayerId}. Deltager i rum '${currentRoomId}'...`;
        // Nu hvor vi er forbundet, send join event
        socket.emit('join_room', { roomId: currentRoomId, playerName });
    });

    socket.on('disconnect', (reason) => {
        connectionStatusDiv.textContent = `Forbindelse afbrudt: ${reason}. Prøv at genindlæse siden.`;
        console.error('Forbindelse afbrudt:', reason);
        showConnectionArea(); // Vis login igen
        // UI nulstilles ikke helt, da man måske genforbinder
        // Nulstil knapper for en sikkerheds skyld
        startButton.disabled = true;
        hitButton.disabled = true;
        standButton.disabled = true;
        // VIGTIGT: Socket.IO prøver måske selv at genforbinde baseret på options
        // Hvis det mislykkes permanent, skal brugeren handle.
        if (reason === 'io server disconnect') {
            // Serveren lukkede forbindelsen aktivt
            socket.disconnect(); // Luk forbindelsen helt fra klientens side
            socket = null;
            myPlayerId = null;
            currentRoomId = null;
            joinButton.disabled = false; // Tillad nyt join forsøg
        }
    });

    socket.on('connect_error', (error) => {
        console.error('Forbindelsesfejl:', error);
        connectionStatusDiv.textContent = `Forbindelsesfejl: ${error.message}. Tjek server-URL og at serveren kører.`;
        joinButton.disabled = false; // Tillad nyt forsøg
        socket = null; // Nulstil socket så nyt forsøg kan ske
        currentRoomId = null; // Nulstil rum ID
    });

    socket.on('init', (data) => {
        console.log('Server init:', data);
    });

    socket.on('join_error', (data) => {
        console.error('Fejl ved join:', data.message);
        joinErrorDiv.textContent = `Kunne ikke deltage: ${data.message}`;
        connectionStatusDiv.textContent = 'Fejl ved deltagelse i rum.';
        joinButton.disabled = false; // Tillad nyt forsøg
        // Bliv på connection skærmen, vis ikke spilområdet
        showConnectionArea();
        // Hvis fejlen skyldes spil i gang, skal man måske ikke disconnecte socket?
        // Man kan vente og prøve at joine igen.
        // socket.disconnect(); // Overvej om denne er nødvendig
        // socket = null;
        currentRoomId = null; // Nulstil rum ID
    });

    socket.on('game_state_update', (gameState) => {
        console.log('Modtog game state:', gameState);
        if (!myPlayerId) myPlayerId = socket.id; // Sørg for at vi har ID
        if (!currentRoomId) currentRoomId = gameState.roomId; // Sørg for vi har rum ID
        updateUI(gameState);
        showGameArea(); // Vis spilområdet hvis det ikke er vist
    });

    socket.on('game_error', (data) => {
        console.error('Spilfejl fra server:', data.message);
        gameErrorDiv.textContent = `Fejl: ${data.message}`;
        // Skjul fejl efter et stykke tid
        setTimeout(() => { gameErrorDiv.textContent = ''; }, 5000);
    });
}

function updateUI(gameState) {
    if (!myPlayerId) {
        console.warn("Player ID not set yet, cannot update UI accurately.");
        if (socket && socket.connected) myPlayerId = socket.id;
        else return;
    }

    gameErrorDiv.textContent = ''; // Ryd gamle fejl
    roomDisplayH2.textContent = `Rum: ${gameState.roomId}`;

    // --- Dealer ---
    renderCards(dealerCardsDiv, gameState.dealer.hand);
    dealerValueSpan.textContent = formatValue(gameState.dealer); // Send hele dealer objektet

    // Vis dealer status tydeligt
    const dealerStatusSpan = document.createElement('span');
    dealerStatusSpan.classList.add('player-status', `status-${gameState.dealer.status.toLowerCase()}`);
    dealerStatusSpan.textContent = formatStatus(gameState.dealer.status);
    // Find eller opret en status container til dealeren
    let dealerInfoDiv = document.getElementById('dealer-info');
    if (!dealerInfoDiv) {
        dealerInfoDiv = document.createElement('div');
        dealerInfoDiv.id = 'dealer-info';
        dealerInfoDiv.classList.add('info');
        dealerCardsDiv.parentNode.appendChild(dealerInfoDiv); // Tilføj efter kortene
    }
     dealerInfoDiv.innerHTML = `Værdi: <span id="dealer-value">${formatValue(gameState.dealer)}</span> `; // Overskriv med ny værdi
    if (gameState.dealer.status !== 'playing' && gameState.dealer.status !== 'waiting' && gameState.dealer.hand.length > 0) {
         dealerInfoDiv.appendChild(dealerStatusSpan); // Tilføj status hvis relevant
    }


    // --- Spillere ---
    playersAreaDiv.innerHTML = '<h3>Spillere</h3>'; // Ryd gamle spillere
    const playerOrder = gameState.playerOrder || Object.keys(gameState.players);

    playerOrder.forEach(playerId => {
        const player = gameState.players[playerId];
        if (!player) return;

        const playerDiv = document.createElement('div');
        playerDiv.classList.add('player-container');
        playerDiv.dataset.playerId = player.id;

        if (player.id === gameState.currentPlayerId && gameState.gamePhase === 'player_turns') {
            playerDiv.classList.add('current-turn');
        }
        if (player.id === myPlayerId) {
            playerDiv.classList.add('my-player');
        }

        const playerName = document.createElement('h4');
        playerName.textContent = `${player.name}${player.id === myPlayerId ? ' (Dig)' : ''}`;

        const playerCardsDiv = document.createElement('div');
        playerCardsDiv.classList.add('cards');
        renderCards(playerCardsDiv, player.hand);

        const playerInfoDiv = document.createElement('div');
        playerInfoDiv.classList.add('info');
        const playerValue = formatValue(player); // Send hele spiller objektet
        const playerStatusSpan = document.createElement('span');
        playerStatusSpan.classList.add('player-status', `status-${player.status.toLowerCase()}`);
        playerStatusSpan.textContent = formatStatus(player.status);

        playerInfoDiv.textContent = `Værdi: ${playerValue} `;
        // Vis kun status hvis den er relevant (ikke bare 'waiting' eller 'playing' under ens egen tur)
        if (player.status !== 'waiting' && !(player.status === 'playing' && player.id === gameState.currentPlayerId)) {
             playerInfoDiv.appendChild(playerStatusSpan);
        }

        playerDiv.appendChild(playerName);
        playerDiv.appendChild(playerCardsDiv);
        playerDiv.appendChild(playerInfoDiv);
        playersAreaDiv.appendChild(playerDiv);
    });

    updateGameMessage(gameState);
    updateActionButtons(gameState);
}

function renderCards(container, hand) {
    container.innerHTML = '';
    if (!hand || hand.length === 0) return;
    hand.forEach(card => {
        container.appendChild(createCardElement(card));
    });
}

function createCardElement(card) {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('card');
    if (card.rank === '?') {
        cardDiv.classList.add('hidden-card');
        cardDiv.innerHTML = '<span>?</span>'; // Brug span for nemmere styling/centrering
    } else {
        cardDiv.textContent = `${card.rank}${card.suit}`;
        const suitClass = `suit-${card.suit}`;
        cardDiv.classList.add(suitClass);
    }
    return cardDiv;
}

// Formater værdi baseret på om kort er skjult
function formatValue(playerOrDealer) {
    const { hand, value } = playerOrDealer;
    if (!hand || hand.length === 0) return '?';

    // Hvis der er et skjult kort, vis kun værdien af det/de synlige kort
    if (hand.some(c => c.rank === '?')) {
         const visibleCards = hand.filter(c => c.rank !== '?');
         if (visibleCards.length === 0) return '?';
         // Beregn kun værdi af synlige kort (typisk kun ét for dealer)
         let visibleValue = 0;
         let aceCount = 0;
         visibleCards.forEach(card => {
            visibleValue += card.value;
            if (card.rank === 'A') aceCount++;
         });
          while (visibleValue > 21 && aceCount > 0) {
              visibleValue -= 10;
              aceCount--;
          }
         return visibleValue;
    }
    // Ellers vis den beregnede værdi fra serveren
    return value > 0 ? value : '?';
}


function formatStatus(status) {
    if (!status) return '';
    const statusMap = {
        'waiting': 'Venter',
        'playing': 'Spiller',
        'busted': 'Busted!',
        'stand': 'Står',
        'blackjack': 'Blackjack!',
        'won': 'Vundet!',
        'lost': 'Tabt',
        'push': 'Push'
    };
    return statusMap[status] || (status.charAt(0).toUpperCase() + status.slice(1));
}

function updateGameMessage(gameState) {
    const { gamePhase, currentPlayerId, players, dealer } = gameState;
    const myPlayer = players[myPlayerId];
    let message = "";

    switch (gamePhase) {
        case 'waiting':
            if (Object.values(players).some(p => ['won', 'lost', 'push', 'blackjack', 'busted'].includes(p.status)) || ['busted', 'stand', 'blackjack'].includes(dealer.status) && dealer.hand.length > 0) {
                if (myPlayer) {
                    const myResultStatus = formatStatus(myPlayer.status).replace('!', ''); // Fjern udråbstegn for pænere sætning
                     message = `Resultat: ${myResultStatus}. `;
                     // Tilføj dealer info
                     if (dealer.status === 'busted') message += "Dealer busted.";
                     else if (dealer.status === 'blackjack') message += "Dealer havde Blackjack.";
                     else if (dealer.status === 'stand') message += `Dealer står med ${dealer.value}.`;

                } else {
                     message = "Spillet er slut. Venter på næste runde.";
                }
                 message += " Klik 'Start Spil' for ny runde.";
            } else if (Object.keys(players).length > 0) {
                message = "Venter på flere spillere eller start af spil. Klik 'Start Spil' når I er klar.";
            } else {
                 message = "Venter på spillere...";
            }
            break;
        case 'dealing':
            message = "Kortene gives...";
            break;
        case 'player_turns':
            if (currentPlayerId === myPlayerId) {
                message = "Din tur! Vælg Hit eller Stand.";
            } else {
                const currentPlayerName = players[currentPlayerId]?.name || 'En spiller';
                message = `Venter på ${currentPlayerName}...`;
            }
            break;
        case 'dealer_turn':
            message = "Dealerens tur...";
            break;
        case 'results':
            message = "Spillet afgøres..."; // Vises kortvarigt
            break;
        default:
            message = `Ukendt spilfase: ${gamePhase}`;
    }
     gameMessageDiv.textContent = message;
}

function updateActionButtons(gameState) {
    const { gamePhase, currentPlayerId, players } = gameState;
    const myPlayer = players[myPlayerId];
    const iAmCurrentPlayer = currentPlayerId === myPlayerId;
    const myStatusIsPlaying = myPlayer?.status === 'playing';
    const canStartGame = gamePhase === 'waiting' && Object.keys(players).length > 0;
     // Tjek om der er en tidligere runde der lige er slut (for at undgå start midt i resultatvisning)
     const justFinished = Object.values(players).some(p => ['won', 'lost', 'push', 'blackjack', 'busted'].includes(p.status));

    startButton.disabled = !(canStartGame && !justFinished); // Aktivér kun i ren 'waiting' state
    hitButton.disabled = !(gamePhase === 'player_turns' && iAmCurrentPlayer && myStatusIsPlaying);
    standButton.disabled = !(gamePhase === 'player_turns' && iAmCurrentPlayer && myStatusIsPlaying);
}

function handleStartGame() {
    if (socket && socket.connected) {
        console.log('Sender start_game');
        socket.emit('start_game');
        startButton.disabled = true;
        gameMessageDiv.textContent = "Starter spil...";
    } else {
        handleConnectionError("Kan ikke starte spil: Ikke forbundet.");
    }
}

function handleHit() {
    if (socket && socket.connected) {
        console.log('Sender hit');
        socket.emit('hit');
         // Deaktiver knapper med det samme for at undgå dobbeltklik
         hitButton.disabled = true;
         standButton.disabled = true;
    } else {
         handleConnectionError("Kan ikke hitte: Ikke forbundet.");
    }
}

function handleStand() {
    if (socket && socket.connected) {
        console.log('Sender stand');
        socket.emit('stand');
         // Deaktiver knapper med det samme for at undgå dobbeltklik
         hitButton.disabled = true;
         standButton.disabled = true;
    } else {
         handleConnectionError("Kan ikke stå: Ikke forbundet.");
    }
}

function handleConnectionError(message) {
     console.error(message);
     gameErrorDiv.textContent = `Fejl: ${message} Prøv at genindlæse siden.`;
     showConnectionArea(); // Gå tilbage til login skærmen
     if (socket) {
         socket.disconnect(); // Luk forbindelsen hvis der er fejl
         socket = null;
     }
     myPlayerId = null;
     currentRoomId = null;
}


function showConnectionArea() {
    connectionAreaDiv.style.display = 'block';
    gameAreaDiv.style.display = 'none';
    joinButton.disabled = false;
    // Prøv at hente gemt navn når connection vises
    const savedName = localStorage.getItem('blackjack_playerName');
    if (savedName) playerNameInput.value = savedName;
}

function showGameArea() {
    connectionAreaDiv.style.display = 'none';
    gameAreaDiv.style.display = 'block';
}

// Initialiser UI state ved start
showConnectionArea();