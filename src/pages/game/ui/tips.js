function initTipsCarousel() {
  'use strict';

  const GO_TIPS = [
    {
      title: '🎯 Окружай пустоту, а не забивай доску',
      desc: 'Очки приносят именно пустые перекрестки внутри вашего забора. Не заполняйте свою территорию камнями — этим вы не увеличиваете счет, а крадете дыхания у своих камней и рискуете потерять всю группу!',
      terms: 'Территория (Дзи), Самоудушение (Дамэ-дзумари)'
    },
    {
      title: '👑 Угол — золото, сторона — серебро, центр — трава',
      desc: 'Классическое правило для большой доски: углы огородить проще всего (края помогают бесплатно). Но на маленькой доске 9х9 центр (Тэнгэн E5) настолько близко ко всем углам, что первый ход в центр считается сильнейшим!',
      terms: 'Углы (Суми), Тэнгэн (Центр E5), Специфика доски 9х9'
    },
    {
      title: '👀 Два глаза — абсолютное бессмертие',
      desc: 'Группа камней неуязвима, если внутри нее есть два отдельных пустых перекрестка. Противник не может пойти сразу в обе точки, а ход в одну — запрещенное самоубийство!',
      terms: 'Два глаза (Ни-ган), Живая группа (Ики), Смерть (Сини)'
    },
    {
      title: '✋ Когда пора пасовать',
      desc: 'Пасуйте, когда границы территории ясны и выгодных ходов больше нет. После двух пасов отметьте мёртвые группы и проверьте счёт. Если позиция ещё спорная, продолжите игру.',
      terms: 'Пас (Пасу), Финал партии (Сюбан)'
    },
    {
      title: '🐯 «Пасть тигра» — надежный страж',
      desc: 'Постройте треугольник из трех камней с пустой точкой посередине. Любой вражеский камень, попытавшийся вторгнуться внутрь этой пасти, мгновенно окажется в ловушке с 1 дыханием.',
      terms: 'Пасть тигра (Какэ-цуги)'
    },
    {
      title: '🎋 Бамбуковый сустав — замок от разрезания',
      desc: 'Две пары камней, стоящие параллельно через одну клетку, невозможно разорвать. Куда бы соперник ни попытался вклиниться между ними, вы перекрываете соседнюю точку.',
      terms: 'Бамбуковый сустав (Такэфу)'
    },
    {
      title: '⚡ Двойной удар — вилка Атари',
      desc: 'Ищите ходы, которые атакуют сразу две независимые группы соперника (у каждой остается по 1 дыханию). Спасти обе за один ход невозможно — одну из них вы гарантированно заберете!',
      terms: 'Двойное атари (Рё-атари)'
    },
    {
      title: '📏 Третья линия для очков, четвертая — для атаки',
      desc: '3-я линия от края доски прочно держит территорию. 4-я линия смотрит в центр и дает мощное влияние для будущих атак. Чередуйте их для гармоничной формы.',
      terms: 'Линия территории (Сан-сэн), Линия влияния (Йон-сэн)'
    },
    {
      title: '🔨 Хане на голове двух камней',
      desc: 'Если два камня соперника вытянулись в прямую линию, ударьте своим камнем в лоб под прямым углом. Это классический удушающий прием, сковывающий дыхания врага.',
      terms: 'Хане на голове (Атама-о-ханэ)'
    },
    {
      title: '⚠️ Избегайте «Пустого треугольника»',
      desc: 'Старайтесь никогда не ставить три камня уголком вокруг пустого перекрестка. Это тяжелая и неэффективная форма: камней потрачено много, а дыханий у группы получается мало.',
      terms: 'Пустой треугольник (Аки-санкаку)'
    },
    {
      title: '🪜 Смертоносная «Лестница»',
      desc: 'Если ваш камень атакуют и гонят зигзагом (лесенкой), не пытайтесь бежать дальше! Каждый шаг побега лишь увеличивает размер пленной группы, которая разобьется о край доски.',
      terms: 'Лестница / Ситё (Shicho)'
    },
    {
      title: '♾️ Священное правило Ко',
      desc: 'Запрещено бесконечно перезахватывать один и тот же камень туда-сюда. Если соперник съел камень в Ко, вы обязаны сначала сделать ход в другом месте (Ко-угрозу), заставив его ответить.',
      terms: 'Ко-борьба (Ко), Ко-угроза (Ко-датэ)'
    },
    {
      title: '🦘 Прыжок через одну клетку',
      desc: 'Не стройте сплошной забор камень к камню. Шаг с разрывом в один пустой перекресток соединяется мгновенно, но захватывает доску в два раза быстрее сплошной цепи.',
      terms: 'Однопунктовый прыжок (Иккэн-тоби)'
    },
    {
      title: '🐎 Ход коня — гибкость и маневр',
      desc: 'Ход на одну клетку вперед и одну вбок (буквой «Г», как конь в шахматах) помогает стремительно приблизиться к углу соперника или плавно защитить свою базу.',
      terms: 'Ход коня / малое скольжение (Кэйма)'
    },
    {
      title: '🎭 Ложный глаз — иллюзия жизни',
      desc: 'Не всякая пустая дыра внутри группы — настоящий глаз. Если диагональные углы перехвачены соперником, глаз считается ложным: соперник сможет туда ворваться и разрушить форму.',
      terms: 'Ложный глаз (Каки-ган), Истинный глаз (Син-ган)'
    },
    {
      title: '♟️ Жертвуй малое ради великого',
      desc: 'Не цепляйтесь за каждый отдельный камень. Часто выгодно отдать 1-2 камня в плен, но взамен построить мощную внешнюю стену и забрать четверть поля.',
      terms: 'Жертвенный камень (Сутэиси), Толщина (Ацуми)'
    },
    {
      title: '⚖️ Коми — компенсация за второй ход',
      desc: 'Черные ходят первыми и владеют инициативой, поэтому Белые в конце получают фору (коми зависит от размера доски). Половинка очка (0.5) нужна для того, чтобы в партии никогда не было ничьей.',
      terms: 'Коми (Komi)'
    },
    {
      title: '🔗 Соединяй свои силы, разделяй чужие',
      desc: 'Соединенные камни делят общие дыхания и становятся несокрушимой крепостью. Разрезанные группы соперника слабы по отдельности — нападайте на слабейшую часть.',
      terms: 'Соединение (Цуги), Разрезание (Кири)'
    }
  ];

  let currentTipIndex = 0;
  let tipElapsed = 0;
  const TIP_DURATION = 60000; // 1 минута на каждую подсказку
  let isTipPaused = false;
  let isTipHovered = false;
  let lastTipTimestamp = null;

  function renderCurrentTip() {
    const tip = GO_TIPS[currentTipIndex];
    const headlineEl = document.getElementById('tipHeadline');
    const descEl = document.getElementById('tipDesc');
    const termsEl = document.getElementById('tipTerms');
    const counterEl = document.getElementById('tipsCounter');
    const contentEl = document.getElementById('tipsContent');

    if (!tip || !headlineEl) return;

    headlineEl.textContent = tip.title;
    descEl.textContent = tip.desc;
    termsEl.innerHTML = `<span>📚 <strong>Термины:</strong> ${tip.terms}</span>`;
    counterEl.textContent = `${currentTipIndex + 1} / ${GO_TIPS.length}`;

    contentEl.classList.remove('tips-fade-in');
    void contentEl.offsetWidth; // Триггер перезапуска CSS-анимации
    contentEl.classList.add('tips-fade-in');
  }

  function updateTipControls() {
    const pauseBtn = document.getElementById('btnTipPause');
    const carouselEl = document.getElementById('tipsCarousel');
    const isPaused = isTipPaused || isTipHovered;

    if (pauseBtn) {
      pauseBtn.textContent = isTipPaused ? '▶' : '⏸';
      pauseBtn.title = isTipPaused ? 'Возобновить автосмену' : 'Приостановить автосмену';
    }
    if (carouselEl) {
      if (isPaused) carouselEl.classList.add('paused');
      else carouselEl.classList.remove('paused');
    }
  }

  function nextTip() {
    currentTipIndex = (currentTipIndex + 1) % GO_TIPS.length;
    tipElapsed = 0;
    renderCurrentTip();
  }

  function prevTip() {
    currentTipIndex = (currentTipIndex - 1 + GO_TIPS.length) % GO_TIPS.length;
    tipElapsed = 0;
    renderCurrentTip();
  }

  function tipLoop(timestamp) {
    if (!lastTipTimestamp) lastTipTimestamp = timestamp;
    const delta = timestamp - lastTipTimestamp;
    lastTipTimestamp = timestamp;

    if (!isTipPaused && !isTipHovered) {
      tipElapsed += delta;
      if (tipElapsed >= TIP_DURATION) {
        tipElapsed = 0;
        nextTip();
      }
      const percent = Math.min(100, (tipElapsed / TIP_DURATION) * 100);
      const bar = document.getElementById('tipsLoaderFill');
      if (bar) bar.style.width = `${percent.toFixed(1)}%`;
    }

    requestAnimationFrame(tipLoop);
  }

  renderCurrentTip();
  requestAnimationFrame(tipLoop);

  const btnNext = document.getElementById('btnTipNext');
  const btnPrev = document.getElementById('btnTipPrev');
  const btnPause = document.getElementById('btnTipPause');
  const carousel = document.getElementById('tipsCarousel');

  if (btnNext) btnNext.addEventListener('click', nextTip);
  if (btnPrev) btnPrev.addEventListener('click', prevTip);
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      isTipPaused = !isTipPaused;
      updateTipControls();
    });
  }

  if (carousel) {
    carousel.addEventListener('mouseenter', () => {
      isTipHovered = true;
      updateTipControls();
    });
    carousel.addEventListener('mouseleave', () => {
      isTipHovered = false;
      updateTipControls();
    });
  }
}
