const $ = id => document.getElementById(id);
const keyName = 'family-bet-site-client';
const ticketName = 'family-bet-site-ticket';
const voteForm = $('voteForm');

async function loadStats() {
  try {
    const response = await fetch('/api/stats');
    if (!response.ok) throw Error();
    const { boy, girl } = await response.json();
    const total = boy + girl;
    $('boyCount').textContent = boy.toLocaleString('ru-RU');
    $('girlCount').textContent = girl.toLocaleString('ru-RU');
    $('totalCount').textContent = total.toLocaleString('ru-RU');
    const boyPercent = total ? Math.round(boy / total * 100) : 0;
    const girlPercent = total ? 100 - boyPercent : 0;
    $('boyPercent').textContent = boyPercent + '%';
    $('girlPercent').textContent = girlPercent + '%';
    $('boyBar').style.width = boyPercent + '%';
    $('girlBar').style.width = girlPercent + '%';
    $('updated').textContent = 'ДАННЫЕ ОБНОВЛЕНЫ';
  } catch {
    $('updated').textContent = 'НЕТ СВЯЗИ С ТАБЛО';
  }
}

function showTicket(ticket) {
  const boy = ticket.prediction === 'boy';
  $('ticketName').textContent = ticket.nickname.toUpperCase();
  $('ticketChoice').textContent = boy ? 'МАЛЬЧИК' : 'ДЕВОЧКА';
  $('ticketChoice').style.color = boy ? '#3b9cff' : '#ff397d';
  $('ticketNumber').textContent = ticket.number;
  $('ticket').classList.add('show');
  voteForm.querySelectorAll('input, textarea, button').forEach(control => { control.disabled = true; });
  voteForm.querySelector('button').textContent = 'ПРОГНОЗ ПРИНЯТ ✓';
  $('formMessage').textContent = 'Прогноз зарегистрирован. Забирай билет!';
}

try {
  const saved = JSON.parse(localStorage.getItem(ticketName));
  if (saved) showTicket(saved);
} catch {}

voteForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  $('formMessage').textContent = 'Регистрируем прогноз…';
  try {
    let key = localStorage.getItem(keyName);
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem(keyName, key);
    }
    const response = await fetch('/api/vote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key, nickname: $('nickname').value, comment: $('comment').value,
        prediction: voteForm.querySelector('input[name="prediction"]:checked')?.value,
        consent: $('consent').checked, publishComment: $('publishComment').checked,
      }),
    });
    const ticket = await response.json();
    if (!response.ok) throw Error(ticket.error);
    try { localStorage.setItem(ticketName, JSON.stringify(ticket)); } catch {}
    showTicket(ticket);
    $('ticket').scrollIntoView({ behavior: 'smooth', block: 'center' });
    loadStats();
    loadComments();
  } catch (error) {
    $('formMessage').textContent = error.message || 'Проверь соединение и попробуй ещё раз.';
    button.disabled = false;
  }
});

$('shareTicket').addEventListener('click', async () => {
  const copy = ['Мой билет FAMILY BET', $('ticketName').textContent,
    'Прогноз: ' + $('ticketChoice').textContent, $('ticketNumber').textContent].join('\n');
  try {
    await navigator.clipboard.writeText(copy);
    $('shareTicket').textContent = 'СКОПИРОВАНО ✓';
  } catch {
    $('shareTicket').textContent = 'НОМЕР БИЛЕТА: ' + $('ticketNumber').textContent;
  }
});

let commentCursor = null;
let commentRequest = 0;
async function loadComments(append = false) {
  if (append && commentCursor === null) return;
  const currentRequest = ++commentRequest;
  const more = $('moreComments');
  more.disabled = true;
  try {
    const query = append ? '?before=' + commentCursor : '';
    const response = await fetch('/api/comments' + query);
    if (!response.ok) throw Error();
    const { comments, next } = await response.json();
    if (currentRequest !== commentRequest) return;
    const list = $('publicComments');
    if (!append) list.replaceChildren();
    for (const row of comments) {
      const article = document.createElement('article');
      article.className = 'public-comment';
      const title = document.createElement('h3');
      const choice = document.createElement('span');
      const boy = row.prediction === 'boy';
      choice.className = boy ? 'boy-text' : 'girl-text';
      choice.textContent = boy ? 'Мальчик' : 'Девочка';
      title.append(row.nickname + ' · ', choice);
      const comment = document.createElement('p');
      comment.textContent = row.comment;
      article.append(title, comment);
      list.append(article);
    }
    commentCursor = next;
    more.hidden = next === null;
    $('commentsStatus').textContent = list.childElementCount ? '' : 'Пока нет публичных комментариев.';
  } catch {
    if (currentRequest === commentRequest) $('commentsStatus').textContent = 'Не удалось загрузить комментарии. Попробуй обновить страницу.';
  } finally {
    if (currentRequest === commentRequest) more.disabled = false;
  }
}
$('moreComments').addEventListener('click', () => loadComments(true));
loadComments();

loadStats();
setInterval(loadStats, 30000);
