document.addEventListener('DOMContentLoaded', () => {
    const lockoutOverlay = document.getElementById('lockoutOverlay');
    const gameModal = document.getElementById('gameModal');
    const gameContainer = document.getElementById('gameContainer');
    const closeGameBtn = document.getElementById('closeGameBtn');

    // 1. Lockout Logic check
    const checkLockout = () => {
       const activePhase = window.localStorage.getItem('activeTimerPhase');
       if(activePhase === 'study' || activePhase === 'paused_study') {
          lockoutOverlay.style.display = 'flex';
       } else {
          lockoutOverlay.style.display = 'none';
       }
    };
    checkLockout();

    // Re-check periodically in case user changes it in another tab
    window.addEventListener('storage', checkLockout);

    // 2. Modal interactions
    const openGame = (title) => {
       gameContainer.innerHTML = '';
       gameModal.style.display = 'flex';
       return gameContainer;
    };
    closeGameBtn.addEventListener('click', () => { 
       gameModal.style.display = 'none'; 
       gameContainer.innerHTML = '';
    });

    // ==========================================
    // TIC TAC TOE
    // ==========================================
    document.getElementById('btnTtt').addEventListener('click', () => {
       const container = openGame('Tic Tac Toe');
       container.innerHTML = `
          <h2>Tic Tac Toe</h2>
          <div class="ttt-grid" id="tttGrid"></div>
          <h3 id="tttStatus" style="margin-top:1rem;">Your turn (X)</h3>
          <button class="btn" style="margin-top:1rem; border:1px solid var(--accent-primary)" id="tttReset">Restart</button>
       `;
       
       let board = ["", "", "", "", "", "", "", "", ""];
       let active = true;
       const grid = document.getElementById('tttGrid');
       const status = document.getElementById('tttStatus');

       const winCombos = [
          [0,1,2],[3,4,5],[6,7,8], [0,3,6],[1,4,7],[2,5,8], [0,4,8],[2,4,6]
       ];

       const checkWin = () => {
          for(let combo of winCombos) {
             const [a,b,c] = combo;
             if(board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
          }
          if(!board.includes("")) return "Tie";
          return null;
       };

       const botMove = () => {
          if(!active) return;
          const empties = board.map((v,i) => v === "" ? i : null).filter(v => v !== null);
          if(empties.length > 0) {
             const idx = empties[Math.floor(Math.random() * empties.length)];
             board[idx] = "O";
             render();
             let res = checkWin();
             if(res) { active = false; status.textContent = res === "Tie" ? "It's a Tie!" : "Bot Wins!"; }
             else { status.textContent = "Your turn (X)"; }
          }
       };

       const render = () => {
          grid.innerHTML = '';
          board.forEach((val, i) => {
             const cell = document.createElement('div');
             cell.className = 'ttt-cell';
             cell.textContent = val;
             cell.style.color = val === 'X' ? 'var(--accent-primary)' : 'var(--success)';
             cell.addEventListener('click', () => {
                if(val !== "" || !active) return;
                board[i] = "X";
                render();
                let res = checkWin();
                if(res) { active = false; status.textContent = res === "Tie" ? "It's a Tie!" : "You Win!"; return; }
                status.textContent = "Bot thinking...";
                setTimeout(botMove, 400);
             });
             grid.appendChild(cell);
          });
       };

       document.getElementById('tttReset').addEventListener('click', () => {
          board = ["", "", "", "", "", "", "", "", ""];
          active = true; status.textContent = "Your turn (X)";
          render();
       });
       render();
    });

    // ==========================================
    // ROCK PAPER SCISSORS
    // ==========================================
    document.getElementById('btnRps').addEventListener('click', () => {
       const container = openGame('Rock Paper Scissors');
       container.innerHTML = `
          <h2>Rock Paper Scissors</h2>
          <div class="rps-choices">
             <button class="rps-btn" data-choice="👊">👊</button>
             <button class="rps-btn" data-choice="✋">✋</button>
             <button class="rps-btn" data-choice="✌️">✌️</button>
          </div>
          <div id="rpsResult" style="font-size: 1.5rem; height: 60px;">Select your weapon!</div>
       `;
       const options = ['👊','✋','✌️'];
       const winMap = { '👊':'✌️', '✋':'👊', '✌️':'✋' };
       const resDiv = document.getElementById('rpsResult');

       document.querySelectorAll('.rps-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
             const player = btn.getAttribute('data-choice');
             const bot = options[Math.floor(Math.random() * options.length)];
             if(player === bot) {
                resDiv.innerHTML = `You: ${player} | Bot: ${bot}<br/><span style="color:var(--text-muted)">Draw!</span>`;
             } else if (winMap[player] === bot) {
                resDiv.innerHTML = `You: ${player} | Bot: ${bot}<br/><span style="color:var(--accent-primary)">You Win! 🎉</span>`;
             } else {
                resDiv.innerHTML = `You: ${player} | Bot: ${bot}<br/><span style="color:var(--success)">Bot Wins! 😢</span>`;
             }
          });
       });
    });

    // ==========================================
    // HANGMAN
    // ==========================================
    document.getElementById('btnHangman').addEventListener('click', () => {
       const container = openGame('Hangman');

       // Each entry: [word, hint/category]
       const dictionary = [
         ["STUDY",    "Something students do to prepare for exams"],
         ["FOCUS",    "The ability to concentrate without distraction"],
         ["SCIENCE",  "A subject that includes physics, chemistry & biology"],
         ["LIBRARY",  "A place where you borrow books"],
         ["LEARN",    "What you do every day at school or university"],
         ["FUTURE",   "What comes after the present"],
         ["PLANNER",  "A tool to organise your schedule"],
         ["ACHIEVE",  "To successfully reach a goal"],
         ["HABIT",    "A routine repeated regularly"],
         ["DEADLINE", "The last day to submit an assignment"],
         ["REVISION", "Going over your notes before a test"],
       ];
       
       container.innerHTML = `
          <h2>Hangman</h2>
          <div id="hmLives" style="margin-top:0.5rem; color:var(--success)">Lives: ❤️❤️❤️❤️❤️❤️</div>
          <div id="hmHint" style="margin:0.75rem 0; color:var(--text-muted); font-size:0.9rem; font-style:italic;">Hint: ...</div>
          <div class="word-display" id="hmWord"></div>
          <div class="keyboard-grid" id="hmKbd"></div>
          <h3 id="hmStatus" style="margin:1rem 0; height: 30px;"></h3>
          <button class="btn" style="border:1px solid var(--accent-primary)" id="hmReset">New Word</button>
       `;

       let target = "";
       let hint = "";
       let guessed = new Set();
       let lives = 6;
       let active = true;

       const wordDiv  = document.getElementById('hmWord');
       const kbdDiv   = document.getElementById('hmKbd');
       const livesDiv = document.getElementById('hmLives');
       const statDiv  = document.getElementById('hmStatus');
       const hintDiv  = document.getElementById('hmHint');

       const init = () => {
          const pick = dictionary[Math.floor(Math.random() * dictionary.length)];
          target = pick[0];
          hint   = pick[1];
          guessed.clear(); lives = 6; active = true;
          statDiv.textContent = "";
          hintDiv.textContent = "Hint: " + hint;
          updateWord(); renderKbd(); updateLives();
       };

       const updateLives = () => {
          livesDiv.textContent = 'Lives: ' + '❤️'.repeat(lives) + '🖤'.repeat(6 - lives);
       };

       const checkWin = () => {
          if(lives <= 0) {
             active = false;
             statDiv.textContent = "Game Over! The word was: " + target;
             statDiv.style.color = "var(--accent-primary)";
             wordDiv.textContent = target;
          } else if(target.split('').every(c => guessed.has(c))) {
             active = false;
             statDiv.textContent = "You Win! 🎉";
             statDiv.style.color = "var(--success)";
          }
       };

       const updateWord = () => {
          const display = target.split('').map(c => guessed.has(c) ? c : '_').join('  ');
          wordDiv.textContent = display;
       };

       const renderKbd = () => {
          kbdDiv.innerHTML = '';
          for(let i=65; i<=90; i++) {
             const char = String.fromCharCode(i);
             const btn = document.createElement('button');
             btn.className = 'kbd-btn';
             btn.textContent = char;
             btn.disabled = guessed.has(char);
             if(guessed.has(char)) {
                btn.style.background = target.includes(char) ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.15)';
             }
             btn.addEventListener('click', () => {
                if(!active) return;
                guessed.add(char);
                if(!target.includes(char)) lives--;
                updateLives(); updateWord(); renderKbd(); checkWin();
             });
             kbdDiv.appendChild(btn);
          }
       };

       document.getElementById('hmReset').addEventListener('click', init);
       init();
    });

    // ==========================================
    // SUDOKU 4x4
    // ==========================================
    document.getElementById('btnSudoku').addEventListener('click', () => {
       const container = openGame('Sudoku (4x4)');
       container.innerHTML = `
          <h2>Sudoku</h2>
          <div class="sudoku-grid" id="sudokuGrid"></div>
          <h3 id="suStatus" style="height:30px; margin-top:1rem;"></h3>
          <button class="btn" style="border:1px solid var(--accent-primary)" id="suCheck">Check Solution</button>
       `;

       // 4x4 puzzle template
       // 0 means empty
       const puzzle = [
          [1, 0, 3, 0],
          [0, 2, 0, 4],
          [3, 0, 0, 1],
          [0, 1, 4, 0]
       ];
       const solution = [
          [1, 4, 3, 2],
          [5, 2, 1, 4], // wait, normal 4x4 only uses 1-4!
       ]; 
       // Proper valid 4x4
       const basePuzzle = [
         [1, 0, 3, 4],
         [0, 0, 1, 0],
         [0, 1, 0, 0],
         [3, 4, 0, 1]
       ];
       const resolvedPuzzle = [
         [1, 2, 3, 4],
         [4, 3, 1, 2],
         [2, 1, 4, 3],
         [3, 4, 2, 1]
       ];

       const gridDiv = document.getElementById('sudokuGrid');
       const statDiv = document.getElementById('suStatus');
       
       const inputs = [];

       for(let r=0; r<4; r++){
          for(let c=0; c<4; c++){
             const val = basePuzzle[r][c];
             const cell = document.createElement('input');
             cell.type = 'text'; cell.className = 'sudoku-cell'; cell.maxLength = 1;
             cell.dataset.r = r; cell.dataset.c = c;
             
             if(val !== 0) {
                cell.value = val;
                cell.classList.add('readonly');
                cell.readOnly = true;
             } else {
                // Ensure only numbers 1-4
                cell.addEventListener('input', (e) => {
                   cell.value = cell.value.replace(/[^1-4]/g, '');
                   statDiv.textContent = ""; // clear status on edit
                });
             }
             inputs.push(cell);
             gridDiv.appendChild(cell);
          }
       }

       document.getElementById('suCheck').addEventListener('click', () => {
          let win = true;
          for(let cell of inputs) {
             const r = cell.dataset.r; const c = cell.dataset.c;
             if(parseInt(cell.value) !== resolvedPuzzle[r][c]) {
                win = false; break;
             }
          }
          if(win) {
             statDiv.textContent = "Perfect! You solved it 🎉";
             statDiv.style.color = "var(--success)";
          } else {
             statDiv.textContent = "Hmm, something's not right. Keep trying!";
             statDiv.style.color = "var(--accent-primary)";
          }
       });
    });

});
