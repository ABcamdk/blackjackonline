// -------- Eksisterende Server Kode (Modificeret) --------

const express = require('express');
const app = express();
const http = require('http');
const cors = require('cors'); // Skal stadig bruges for Express middleware generelt
const { Server } = require('socket.io');
const path = require('path'); // Tilføjet for at håndtere filstier

// Init server
app.use(cors()); // Tillad CORS requests til Express ruter generelt

// --- Servering af Frontend Filer ---
// Fortæl Express at den skal servere statiske filer (HTML, CSS, JS)
// fra 'public' mappen. __dirname er den aktuelle mappe hvor server.js ligger.
app.use(express.static(path.join(__dirname, 'public')));

// Fallback: Hvis en anmodning ikke matcher en statisk fil eller anden rute,
// sendes index.html. Dette er nyttigt for single-page applications.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// --- Slut på Servering af Frontend Filer ---


const server = http.createServer(app);

// Socket.IO konfiguration - tillad forbindelser fra alle oprindelser (*)
// Dette er typisk fint til LAN, da browseren tilgår siden fra serverens IP.
const io = new Server(server, {
    cors: {
        origin: "*", // Tillader forbindelser fra klienter på LAN
        methods: ["GET", "POST", "POLLING"],
        allowedHeaders: ["content-type"],
    }
});


// -------- Nye Klasser for Blackjack (Uændret fra tidligere svar) --------

class Card {
    constructor(suit, rank, value) {
        this.suit = suit; // Hjerter, Spar, Ruder, Klør
        this.rank = rank; // 2, 3, ..., 10, J, Q, K, A
        this.value = value; // Numerisk værdi (J,Q,K = 10, A = 1 eller 11)
    }
}

class Deck {
    constructor() {
        this.cards = [];
        this.createDeck();
        this.shuffle();
    }

    createDeck() {
        const suits = ['♥', '♠', '♦', '♣'];
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        this.cards = []; // Nulstil før oprettelse

        for (const suit of suits) {
            for (const rank of ranks) {
                let value;
                if (['J', 'Q', 'K'].includes(rank)) {
                    value = 10;
                } else if (rank === 'A') {
                    value = 11; // Startværdi for Es
                } else {
                    value = parseInt(rank);
                }
                this.cards.push(new Card(suit, rank, value));
            }
        }
    }

    shuffle() {
        // Fisher-Yates shuffle
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    dealCard() {
        if (this.cards.length === 0) {
            console.log("Deck empty, creating and shuffling new one.");
            this.createDeck();
            this.shuffle();
        }
        return this.cards.pop();
    }
}

class Player {
    constructor(id, name = `Player_${id.substring(0, 4)}`) {
        this.id = id;
        this.name = name;
        this.hand = [];
        this.value = 0;
        this.status = 'waiting'; // waiting, playing, busted, stand, blackjack, won, lost, push
        this.isDealer = false;
    }

    addCard(card) {
        this.hand.push(card);
        this.calculateValue();
    }

    calculateValue() {
        let value = 0;
        let aceCount = 0;
        for (const card of this.hand) {
            value += card.value;
            if (card.rank === 'A') {
                aceCount++;
            }
        }
        // Juster for Esser
        while (value > 21 && aceCount > 0) {
            value -= 10;
            aceCount--;
        }
        this.value = value;

        // Opdater status baseret på værdi
        if (value > 21) {
            this.status = 'busted';
        }
        // Blackjack (kun ved 2 kort)
        else if (value === 21 && this.hand.length === 2) {
             // Kun blackjack hvis det er de første to kort - startGame håndterer dette specifikt
             // Her sætter vi det ikke direkte, da status kan være sat til andet (fx 'stand' hvis man rammer 21 senere)
        }
        // Andre statusser ('playing', 'stand') styres af spillets flow
    }

    reset() {
        this.hand = [];
        this.value = 0;
        this.status = 'waiting';
    }

    // Giver en version af spilleren, der kan sendes til klienter
    getClientState(isDealerTurnOrLater = false) {
        const state = {
            id: this.id,
            name: this.name,
            value: this.value,
            status: this.status,
            isDealer: this.isDealer,
            hand: [], // Start tom
        };

        // Logik for at vise/skjule dealerens kort
        if (this.isDealer) {
            if (this.hand.length === 0) {
                state.hand = [];
                state.value = 0; // Ingen værdi endnu
            } else if (this.hand.length === 1 || (this.hand.length >= 2 && !isDealerTurnOrLater)) {
                // Vis kun første kort + et skjult kort, hvis der er mindst to, og det IKKE er dealerens tur endnu
                state.hand = [this.hand[0], { suit: '?', rank: '?', value: 0 }];
                // Vis kun værdien af det synlige kort
                state.value = this.hand[0].rank === 'A' ? 11 : this.hand[0].value;
            } else {
                // Vis alle dealerens kort (dealerens tur er startet eller spillet er slut)
                state.hand = this.hand;
                state.value = this.value; // Vis den faktiske beregnede værdi
            }
        } else {
            // For almindelige spillere, vis altid deres hånd og værdi
            state.hand = this.hand;
            state.value = this.value;
        }

        return state;
    }
}


class BlackjackGame {
    constructor(roomId, io) {
        this.roomId = roomId;
        this.io = io; // Socket.IO server instance for broadcasting
        this.deck = new Deck();
        this.players = {}; // Map socket.id -> Player object
        this.dealer = new Player('dealer', 'Dealer');
        this.dealer.isDealer = true;
        this.currentPlayerId = null; // Hvem's tur er det?
        this.gamePhase = 'waiting'; // waiting, dealing, player_turns, dealer_turn, results
        this.playerOrder = []; // Rækkefølgen spillerne agerer i
    }

    addPlayer(id, playerInfo) {
        if (this.gamePhase !== 'waiting' && this.gamePhase !== 'results') { // Tillad join mellem runder
            // Man kan ikke joine midt i en aktiv runde (dealing, player_turns, dealer_turn)
            console.log(`Room ${this.roomId}: Cannot add player ${id} during active round (Phase: ${this.gamePhase}).`);
             // Send besked KUN til den spiller der prøver at joine
             this.io.to(id).emit('join_error', { message: 'Spillet er i gang, vent venligst til næste runde.' });
             return false; // Angiv at tilføjelse mislykkedes
        }
        // Opret eller opdater spiller
        const name = playerInfo?.name || `Player_${id.substring(0, 4)}`;
        if (!this.players[id]) { // Kun tilføj hvis ikke allerede eksisterer
            this.players[id] = new Player(id, name);
             // Hvis spillet var i 'results', sæt den nye spiller til 'waiting'
             if (this.gamePhase === 'results') {
                 this.players[id].status = 'waiting';
             }
            console.log(`Player ${this.players[id].name} (${id}) joined room ${this.roomId}`);
            // Tilføj til playerOrder hvis ikke allerede med
             if (!this.playerOrder.includes(id)) {
                 this.playerOrder.push(id);
             }
        } else {
            // Spilleren re-joiner måske, opdater navn hvis nødvendigt
            this.players[id].name = name;
             console.log(`Player ${this.players[id].name} (${id}) reconnected or updated name in room ${this.roomId}`);
        }

        // Når en spiller joiner (eller re-joiner) i 'waiting' eller 'results', skal spillet skifte til 'waiting'
        // hvis der nu er spillere klar
         if (this.gamePhase === 'results' || this.gamePhase === 'waiting') {
             this.gamePhase = 'waiting';
         }

        this.broadcastGameState(); // Opdater alle om den nye spiller/tilstand
        return true; // Angiv at tilføjelse lykkedes
    }


    removePlayer(id) {
        if (!this.players[id]) return; // Spiller findes ikke

        const wasCurrentPlayer = (this.currentPlayerId === id);
        const playerName = this.players[id].name;
        const playerIndex = this.playerOrder.indexOf(id);

        console.log(`Player ${playerName} (${id}) left room ${this.roomId}`);
        delete this.players[id];
        this.playerOrder = this.playerOrder.filter(pId => pId !== id); // Fjern fra tur-rækkefølge

        // Hvis spillet er i gang, og den fjernede spiller var den aktuelle
        if (this.gamePhase === 'player_turns' && wasCurrentPlayer) {
            // Gå til næste spiller (eller dealerens tur)
            this.nextTurn(playerIndex); // Giv den *gamle* index for at finde næste
        }
         // Hvis der ikke er flere spillere tilbage (udover dealer)
        else if (Object.keys(this.players).length === 0 && this.gamePhase !== 'waiting') {
            console.log(`Room ${this.roomId}: No players left, resetting game.`);
            this.resetGame(); // Nulstil helt
        } else {
             // Opdater alle om den nye tilstand (spiller er fjernet)
             // Hvis spillet var i gang, men det *ikke* var den fjernedes tur, fortsætter spillet bare
            this.broadcastGameState();
        }
    }

    startGame() {
        // Kan kun starte hvis vi venter OG der er mindst én spiller
        if (this.gamePhase !== 'waiting' || Object.keys(this.players).length === 0) {
            console.log(`Room ${this.roomId}: Cannot start game (Phase: ${this.gamePhase}, Players: ${Object.keys(this.players).length})`);
            // Send evt. besked tilbage til den der trykkede start
            // this.io.to(senderId).emit('game_error', { message: 'Kan ikke starte spillet nu.' });
            return;
        }
        console.log(`Room ${this.roomId}: Starting game...`);
        this.gamePhase = 'dealing';
        this.deck = new Deck(); // Nyt sæt kort

        // Nulstil dealer
        this.dealer.reset();
        this.dealer.status = 'playing'; // Dealer er klar

        // Nulstil alle spillere der er i rummet
        this.playerOrder = []; // Byg rækkefølgen op igen fra de nuværende spillere
        for (const id in this.players) {
            this.players[id].reset();
            this.players[id].status = 'playing'; // Klar til at spille
            this.playerOrder.push(id); // Tilføj til tur-rækkefølge
        }
        // Bland evt. spiller-rækkefølgen her, hvis ønsket
        // this.playerOrder.sort(() => Math.random() - 0.5);

        // Giv 2 kort til hver spiller og dealeren (én ad gangen)
        for (let i = 0; i < 2; i++) {
            for (const id of this.playerOrder) {
                 if(this.players[id]) this.players[id].addCard(this.deck.dealCard());
            }
            this.dealer.addCard(this.deck.dealCard());
        }

        // Tjek for Blackjacks med det samme efter deal
        let someonePlaying = false; // Er der nogen, der *ikke* har blackjack?
         if (this.dealer.value === 21) { // Tjek dealer først
             this.dealer.status = 'blackjack';
             console.log("Dealer has Blackjack!");
         }
        for (const id of this.playerOrder) {
             if(this.players[id]) {
                if (this.players[id].value === 21) {
                     this.players[id].status = 'blackjack';
                     console.log(`Player ${this.players[id].name} has Blackjack!`);
                } else {
                     // Hvis spilleren ikke har blackjack, er de stadig 'playing'
                     someonePlaying = true;
                }
            }
        }

        // Hvis dealeren har blackjack, er spillet ovre for alle, der ikke også har blackjack
        if (this.dealer.status === 'blackjack') {
            this.gamePhase = 'results';
            this.determineWinners(); // Bestem vindere med det samme
        }
        // Hvis ingen spillere kan spille (alle har blackjack), gå direkte til resultater
        // (Dealer vinder/pusher mod dem med blackjack)
        else if (!someonePlaying && this.playerOrder.length > 0) {
             console.log("All players have Blackjack or none are playing.")
            this.gamePhase = 'dealer_turn'; // Teknisk set dealerens tur, men den er kort
            this.dealerPlay(); // Dealer viser bare sin hånd
        }
        // Ellers, start spillernes ture
        else if (this.playerOrder.length > 0){
            this.gamePhase = 'player_turns';
            // Find den første spiller i rækkefølgen, som *ikke* har blackjack
            this.currentPlayerId = this.playerOrder.find(id => this.players[id]?.status === 'playing') || null;
             if (this.currentPlayerId === null) { // Skulle ikke ske pga. someonePlaying check, men for en sikkerheds skyld
                 console.log("No player found in 'playing' state, going to dealer.");
                 this.gamePhase = 'dealer_turn';
                 this.dealerPlay();
             } else {
                  console.log(`First turn: Player ${this.players[this.currentPlayerId].name}`)
             }
        } else {
             // Ingen spillere i rummet? Gå tilbage til waiting.
             console.log("No players in the room to start the game.")
             this.gamePhase = 'waiting';
        }

        this.broadcastGameState(); // Send den initiale state efter deal
    }


    hit(playerId) {
        if (this.gamePhase !== 'player_turns' || this.currentPlayerId !== playerId) {
            console.log(`Room ${this.roomId}: Invalid hit attempt by ${playerId}. Current turn: ${this.currentPlayerId}`);
            this.io.to(playerId).emit('game_error', { message: "Det er ikke din tur, eller spillet er ikke i gang." });
            return;
        }

        const player = this.players[playerId];
        if (!player || player.status !== 'playing') {
            console.log(`Room ${this.roomId}: Player ${player?.name || playerId} cannot hit (Status: ${player?.status}).`);
            this.io.to(playerId).emit('game_error', { message: `Du kan ikke hitte nu (status: ${player?.status})` });
            return;
        }

        player.addCard(this.deck.dealCard());
        console.log(`Room ${this.roomId}: Player ${player.name} hits. New value: ${player.value}`);

        if (player.status === 'busted') {
            console.log(`Room ${this.roomId}: Player ${player.name} busted!`);
            this.broadcastGameState(); // Vis busted state
            // Vent et kort øjeblik før næste tur for at vise busted state
            setTimeout(() => this.nextTurn(), 750);
        } else if (player.value === 21) {
             console.log(`Room ${this.roomId}: Player ${player.name} reached 21. Standing.`);
             player.status = 'stand'; // Automatisk stand ved 21
             this.broadcastGameState(); // Vis stand state
              // Vent et kort øjeblik før næste tur
             setTimeout(() => this.nextTurn(), 750);
        } else {
            // Spilleren kan hitte igen, opdater kun state
            this.broadcastGameState();
        }
    }

    stand(playerId) {
        if (this.gamePhase !== 'player_turns' || this.currentPlayerId !== playerId) {
            console.log(`Room ${this.roomId}: Invalid stand attempt by ${playerId}. Current turn: ${this.currentPlayerId}`);
             this.io.to(playerId).emit('game_error', { message: "Det er ikke din tur, eller spillet er ikke i gang." });
            return;
        }

        const player = this.players[playerId];
        if (!player || player.status !== 'playing') {
             console.log(`Room ${this.roomId}: Player ${player?.name || playerId} cannot stand (Status: ${player?.status}).`);
             this.io.to(playerId).emit('game_error', { message: `Du kan ikke stå nu (status: ${player?.status})` });
             return;
        }

        player.status = 'stand';
        console.log(`Room ${this.roomId}: Player ${player.name} stands with value ${player.value}`);
        this.broadcastGameState(); // Vis stand state
        // Gå til næste spiller med det samme (ingen grund til pause som ved hit)
        this.nextTurn();
    }

     nextTurn(startIndex = -1) {
         let currentIndex = -1;
         // Hvis startIndex er givet (pga. disconnect/stand/bust), brug den. Ellers find nuværende.
         if (startIndex !== -1) {
             currentIndex = startIndex;
         } else if (this.currentPlayerId && this.playerOrder.includes(this.currentPlayerId)) {
              currentIndex = this.playerOrder.indexOf(this.currentPlayerId);
         } else {
              // Hvis currentPlayerId er null eller ikke i order, start søgning fra begyndelsen
              currentIndex = -1; // Start før den første spiller
         }


         // Find næste spiller i rækkefølgen, der stadig har status 'playing'
         let nextPlayerFound = false;
         for (let i = 1; i <= this.playerOrder.length; i++) {
              let potentialIndex = (currentIndex + i) % this.playerOrder.length;
              let potentialPlayerId = this.playerOrder[potentialIndex];

              // Tjek om spilleren eksisterer og har status 'playing'
              if (this.players[potentialPlayerId] && this.players[potentialPlayerId].status === 'playing') {
                  this.currentPlayerId = potentialPlayerId;
                  console.log(`Room ${this.roomId}: Next turn: Player ${this.players[this.currentPlayerId].name}`);
                  nextPlayerFound = true;
                  break; // Stop søgning, vi fandt den næste
              }
         }


        if (!nextPlayerFound) {
            // Ingen flere spillere har status 'playing', det er dealerens tur
            console.log(`Room ${this.roomId}: All players done. Dealer's turn.`);
            this.currentPlayerId = 'dealer'; // Angiv at det er dealerens "tur"
            this.gamePhase = 'dealer_turn';
            this.dealerPlay(); // Start dealerens logik (som også broadcaster)
        } else {
             // Der var en spiller mere, broadcast den nye state
             this.broadcastGameState();
        }
    }

    dealerPlay() {
        this.gamePhase = 'dealer_turn'; // Sæt fasen eksplicit
        this.currentPlayerId = 'dealer'; // Angiv at det er dealerens "tur"
        console.log(`Room ${this.roomId}: Dealer playing... Initial hand value: ${this.dealer.value} (Status: ${this.dealer.status})`);

        // Hvis dealer har blackjack fra start, går vi direkte til resultater
         if (this.dealer.status === 'blackjack') {
             console.log(`Room ${this.roomId}: Dealer has Blackjack, showing results.`);
             this.gamePhase = 'results';
             this.determineWinners();
             this.broadcastGameState(); // Send den endelige tilstand med resultater
             return; // Stop dealerPlay her
         }

         // Sørg for at dealerens status er 'playing' hvis den ikke er bust/blackjack
         if (this.dealer.status !== 'busted' && this.dealer.status !== 'blackjack') {
             this.dealer.status = 'playing';
         }

        // Afslør dealerens skjulte kort ved at sende hele state igen
        this.broadcastGameState(); // Viser begge kort nu

        // Dealerens logik: Hit indtil 17 eller mere
        // Vi bruger setTimeout til at skabe en lille pause mellem dealerens hits
        const dealerHitLoop = () => {
            // Hvis dealerens tur blev afbrudt (fx alle spillere forlod)
            if (this.gamePhase !== 'dealer_turn') {
                 console.log("Dealer turn interrupted.");
                 return;
            }

             // Tjek om dealeren *skal* hitte (under 17)
            if (this.dealer.value < 17) {
                 console.log(`Room ${this.roomId}: Dealer hits (Value: ${this.dealer.value})`);
                this.dealer.addCard(this.deck.dealCard()); // addCard kalder calculateValue
                 console.log(`Room ${this.roomId}: Dealer new value: ${this.dealer.value} (Status: ${this.dealer.status})`);
                this.broadcastGameState(); // Vis det nye kort og status

                // Planlæg næste tjek/hit efter en kort pause, KUN hvis dealer ikke er busted
                if (this.dealer.status !== 'busted') {
                    setTimeout(dealerHitLoop, 1000); // 1 sekunds pause
                } else {
                    // Dealer busted, gå direkte til resultater efter kort pause
                     console.log(`Room ${this.roomId}: Dealer busted!`);
                    setTimeout(() => {
                         this.gamePhase = 'results';
                         this.determineWinners();
                         this.broadcastGameState();
                    }, 750);
                }
            } else {
                 // Dealer er færdig (>= 17 og ikke busted)
                 console.log(`Room ${this.roomId}: Dealer stands (Value: ${this.dealer.value})`);
                 this.dealer.status = 'stand'; // Sæt status til stand
                 this.gamePhase = 'results';
                 this.determineWinners();
                 this.broadcastGameState(); // Send den endelige tilstand med resultater
            }
        };

        // Start dealerens hit-loop efter en kort initial pause (for at vise det afslørede kort)
        setTimeout(dealerHitLoop, 1000);
    }


    determineWinners() {
        console.log(`Room ${this.roomId}: Determining winners... Dealer has ${this.dealer.value} (Status: ${this.dealer.status})`);
        const dealerValue = this.dealer.value;
        const dealerBusted = (this.dealer.status === 'busted');
        const dealerHasBlackjack = (this.dealer.status === 'blackjack');

        for (const id in this.players) {
            const player = this.players[id];

            // Spring over hvis spilleren ikke deltog i runden (status er 'waiting')
            if (player.status === 'waiting') continue;

            const playerValue = player.value;
            const playerHasBlackjack = (player.status === 'blackjack');

            // Resultat baseret på spillerens status *før* sammenligning
            if (player.status === 'busted') {
                player.status = 'lost';
                console.log(` -> ${player.name}: Lost (Busted)`);
            } else if (playerHasBlackjack) {
                if (dealerHasBlackjack) {
                    player.status = 'push';
                    console.log(` -> ${player.name}: Push (Both Blackjack)`);
                } else {
                    player.status = 'won'; // Blackjack vinder altid (undtagen mod dealer Blackjack)
                    console.log(` -> ${player.name}: Won (Blackjack!)`);
                }
            } else {
                // Spiller har ikke blackjack og er ikke busted - sammenlign med dealer
                if (dealerHasBlackjack) {
                    player.status = 'lost'; // Dealer Blackjack slår alle andre hænder
                    console.log(` -> ${player.name}: Lost (Dealer Blackjack)`);
                } else if (dealerBusted) {
                    player.status = 'won'; // Vandt fordi dealer busted
                    console.log(` -> ${player.name}: Won (Dealer Busted)`);
                } else if (playerValue > dealerValue) {
                    player.status = 'won'; // Højere værdi end dealer
                    console.log(` -> ${player.name}: Won (${playerValue} vs ${dealerValue})`);
                } else if (playerValue === dealerValue) {
                    player.status = 'push'; // Samme værdi = Push
                    console.log(` -> ${player.name}: Push (${playerValue} vs ${dealerValue})`);
                } else { // playerValue < dealerValue
                    player.status = 'lost'; // Lavere værdi end dealer
                    console.log(` -> ${player.name}: Lost (${playerValue} vs ${dealerValue})`);
                }
            }
        }
        // Efter at have bestemt vindere, skiftes fasen til 'waiting' for næste runde
        this.gamePhase = 'waiting';
        this.currentPlayerId = null; // Ingen har tur
        // broadcastGameState sker fra hvor denne funktion kaldes (dealerPlay eller startGame)
         console.log(`Room ${this.roomId}: Results determined. Phase set to 'waiting'.`);
    }

     // Nulstiller spillet helt, f.eks. hvis alle forlader
     resetGame() {
         console.log(`Room ${this.roomId}: Resetting game state completely.`);
         this.deck = new Deck();
         this.dealer.reset();
         // Behold spillere i rummet, men nulstil dem
         this.playerOrder = [];
         for (const id in this.players) {
             this.players[id].reset(); // Sætter status til 'waiting'
             this.playerOrder.push(id);
         }
         this.currentPlayerId = null;
         this.gamePhase = 'waiting';
         this.broadcastGameState(); // Send den nulstillede tilstand
     }


    getGameState() {
        // Saml data, der skal sendes til klienterne
        const isDealerTurnOrLater = ['dealer_turn', 'results', 'waiting'].includes(this.gamePhase);
        // Tjek om dealerens tur lige er startet (for at vise afsløret kort korrekt)
         const justStartedDealerTurn = this.currentPlayerId === 'dealer' && this.dealer.hand.length === 2;

        const clientPlayers = {};
        // Sorter spillere baseret på playerOrder for konsistent visning
        this.playerOrder.forEach(id => {
             if (this.players[id]) {
                 clientPlayers[id] = this.players[id].getClientState(isDealerTurnOrLater || justStartedDealerTurn);
             }
        });


        return {
            roomId: this.roomId,
            players: clientPlayers, // Indeholder nu kun de spillere der er i playerOrder
            dealer: this.dealer.getClientState(isDealerTurnOrLater || justStartedDealerTurn),
            currentPlayerId: this.currentPlayerId, // Hvem's tur (eller null/dealer)
            gamePhase: this.gamePhase, // waiting, dealing, player_turns, dealer_turn, results
            playerOrder: this.playerOrder // Send rækkefølgen med
        };
    }

    broadcastGameState() {
        const state = this.getGameState();
        // Send til alle i rummet (identificeret ved roomId)
        this.io.to(this.roomId).emit('game_state_update', state);
        // console.log(`Room ${this.roomId}: Broadcasting state (Phase: ${this.gamePhase}, Turn: ${this.currentPlayerId || 'none'})`);
    }
}

// -------- Socket.IO Event Handlers --------

var gameRooms = {}; // roomId -> BlackjackGame object
var ids_to_rooms = {}; // socket.id -> roomId

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    socket.emit('init', { data: 'Connected to Blackjack Server!' });

    socket.on('join_room', (data) => {
        const { roomId, playerName } = data;
        if (!roomId) {
            console.error(`Player ${socket.id} tried to join without roomId.`);
            socket.emit('join_error', { message: 'Room ID is required.' });
            return;
        }

        // Find eller opret spillet/rummet
        let game = gameRooms[roomId];
        if (!game) {
            console.log(`Creating new game room: ${roomId}`);
            game = new BlackjackGame(roomId, io); // Giv io videre til spilklassen
            gameRooms[roomId] = game;
        }

         // Tilføj spillerens socket til Socket.IO rummet FØRST
         // Dette sikrer, at de modtager broadcasten fra addPlayer
         socket.join(roomId);
         console.log(`Socket ${socket.id} joined Socket.IO room ${roomId}`);

        // Tilføj spilleren til spillets logik
        const added = game.addPlayer(socket.id, { name: playerName });

        if (added) {
            ids_to_rooms[socket.id] = roomId;
             // game.addPlayer kalder broadcastGameState internt nu
        } else {
            // Hvis addPlayer returnerede false (join mislykkedes pga. spil i gang)
            // Fjern socket fra rummet igen, da de ikke kunne joine spillet
            socket.leave(roomId);
             console.log(`Socket ${socket.id} could not join game logic, removed from Socket.IO room ${roomId}`);
            // Fejlbesked blev sendt fra addPlayer
        }
    });

    socket.on('start_game', () => {
        const roomId = ids_to_rooms[socket.id];
        if (roomId && gameRooms[roomId]) {
            console.log(`Player ${socket.id} requested start_game in room ${roomId}`);
            gameRooms[roomId].startGame(); // startGame kalder broadcastGameState
        } else {
             console.error(`Cannot start game: Player ${socket.id} not in a valid room or game.`);
             socket.emit('game_error', { message: 'Du er ikke i et gyldigt spilrum.' });
        }
    });

    socket.on('hit', () => {
        const roomId = ids_to_rooms[socket.id];
        if (roomId && gameRooms[roomId]) {
             // console.log(`Player ${socket.id} requested hit in room ${roomId}`); // Mindre verbose log
            gameRooms[roomId].hit(socket.id); // hit kalder broadcast/nextTurn
        } else {
              console.error(`Cannot hit: Player ${socket.id} not in a valid room or game.`);
              socket.emit('game_error', { message: 'Du er ikke i et gyldigt spilrum.' });
        }
    });

    socket.on('stand', () => {
        const roomId = ids_to_rooms[socket.id];
        if (roomId && gameRooms[roomId]) {
             // console.log(`Player ${socket.id} requested stand in room ${roomId}`); // Mindre verbose log
            gameRooms[roomId].stand(socket.id); // stand kalder nextTurn
        } else {
              console.error(`Cannot stand: Player ${socket.id} not in a valid room or game.`);
               socket.emit('game_error', { message: 'Du er ikke i et gyldigt spilrum.' });
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        const roomId = ids_to_rooms[socket.id];

        if (roomId && gameRooms[roomId]) {
            const game = gameRooms[roomId];
            game.removePlayer(socket.id); // Spilklassen håndterer logikken og broadcast

            // Hvis rummet bliver tomt efter fjernelse, slet det fra hukommelsen
            if (Object.keys(game.players).length === 0) {
                console.log(`Room ${roomId} is now empty. Deleting game instance.`);
                delete gameRooms[roomId];
            }
        }
        delete ids_to_rooms[socket.id]; // Fjern altid fra mapping
    });
});

// Start serveren
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Blackjack Server is running on port ${PORT}!`);
    console.log("Ready to accept connections...");
    // Tilføj info om lokal adgang:
    try {
        const interfaces = require('os').networkInterfaces();
        console.log("Access locally via:");
        console.log(`  http://localhost:${PORT}`);
        Object.keys(interfaces).forEach(ifname => {
          interfaces[ifname].forEach(iface => {
            if ('IPv4' !== iface.family || iface.internal !== false) {
              // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
              return;
            }
            console.log(`  http://${iface.address}:${PORT} (for other devices on the same network)`);
          });
        });
    } catch (e) {
        console.log("Could not determine local network IP addresses.");
    }

});