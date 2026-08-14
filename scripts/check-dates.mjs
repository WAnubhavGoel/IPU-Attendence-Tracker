const dates = ['2026-08-11','2026-08-12','2026-08-13','2026-08-14','2026-08-15','2026-08-16','2026-08-18'];
const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
dates.forEach(ds => {
  const d = new Date(ds + 'T00:00:00Z');
  console.log(ds, '=', names[d.getUTCDay()], '(getUTCDay=' + d.getUTCDay() + ')');
});
