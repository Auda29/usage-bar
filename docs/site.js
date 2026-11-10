const designImage = document.querySelector('#design-image');
const designCaption = document.querySelector('#design-caption');
const english = document.documentElement.lang === 'en';
document.querySelectorAll('[data-design]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-design]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    designImage.src = `images/designs/${button.dataset.design}.png`;
    designImage.alt = english
      ? `Usage Bar in the ${button.dataset.label} design with sample data`
      : `Usage Bar im Design ${button.dataset.label}, mit Beispieldaten`;
    designCaption.textContent = `${button.dataset.label} · ${button.dataset.description} · ${english ? 'Sample data' : 'Beispieldaten'}`;
  });
});
