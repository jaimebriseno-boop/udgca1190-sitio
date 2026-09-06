
(function(){
  var secs = Array.prototype.slice.call(document.querySelectorAll('details.sec'));
  var btn  = document.getElementById('toggleAll');
  function sync(){
    var allOpen = secs.every(function(d){ return d.open; });
    btn.textContent = allOpen ? 'Contraer todo' : 'Expandir todo';
    btn.dataset.state = allOpen ? 'open' : 'closed';
  }
  btn && btn.addEventListener('click', function(){
    var open = btn.dataset.state !== 'open';
    secs.forEach(function(d){ d.open = open; }); sync();
  });
  secs.forEach(function(d){ d.addEventListener('toggle', sync); });
  sync();

  // abrir la sección apuntada por el hash y hacer scroll
  function openHash(){
    if(!location.hash) return;
    var el = document.querySelector(location.hash);
    if(!el) return;
    var host = el.closest('details.sec');
    if(host){ host.open = true; sync(); }
    setTimeout(function(){ el.scrollIntoView({block:'start'}); }, 60);
  }
  window.addEventListener('hashchange', openHash); openHash();

  // scrollspy del riel
  var links = Array.prototype.slice.call(document.querySelectorAll('.rail a'));
  var map = {}; links.forEach(function(a){ map[a.getAttribute('href').slice(1)] = a; });
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      var a = map[e.target.id]; if(!a) return;
      if(e.isIntersecting){ links.forEach(function(x){ x.classList.remove('on'); }); a.classList.add('on'); }
    });
  }, {rootMargin:'-70px 0px -72% 0px', threshold:0});
  secs.forEach(function(d){ io.observe(d); });

  // imprimir con todo abierto
  window.addEventListener('beforeprint', function(){ secs.forEach(function(d){ d.open = true; }); });
})();
