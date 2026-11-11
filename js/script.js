// Find our date picker inputs on the page
const startInput = document.getElementById('startDate');
const endInput = document.getElementById('endDate');

// Call the setupDateInputs function from dateRange.js
// This sets up the date pickers to:
// - Default to a range of 9 days (from 9 days ago to today)
// - Restrict dates to NASA's image archive (starting from 1995)
setupDateInputs(startInput, endInput);

const gallery = document.getElementById('gallery');
const getImagesButton = document.getElementById('getImagesButton');
const imageModal = document.getElementById('imageModal');
const modalImage = document.getElementById('modalImage');
const modalTitle = document.getElementById('modalTitle');
const modalDate = document.getElementById('modalDate');
const modalExplanation = document.getElementById('modalExplanation');
const closeModalButton = document.getElementById('closeModalButton');
const spaceFact = document.getElementById('spaceFact');

const apiUrl = '/api/apod';
const spaceFacts = [
  'A day on Venus is longer than a year on Venus.',
  'Saturn is less dense than water, though there is no ocean large enough to hold it.',
  'Neptune was first found through mathematical predictions before it was seen through a telescope.',
  'The International Space Station travels around Earth at about 28,000 kilometers per hour.',
  'The Sun contains about 99.8 percent of the total mass in our solar system.'
];

// Pick a new fact whenever the page loads.
const factIndex = Math.floor(Math.random() * spaceFacts.length);
spaceFact.textContent = spaceFacts[factIndex];

function showGalleryMessage(message) {
  const placeholder = document.createElement('div');
  placeholder.className = 'placeholder';
  placeholder.textContent = message;
  gallery.replaceChildren(placeholder);
}

function addGalleryItem(photo) {
  const item = document.createElement('button');
  item.className = 'gallery-item';
  item.type = 'button';
  item.setAttribute('aria-label', `View ${photo.title} from ${photo.date}`);

  const image = document.createElement('img');
  image.src = photo.url;
  image.alt = photo.title;
  image.loading = 'lazy';

  const title = document.createElement('p');
  title.className = 'gallery-title';
  title.textContent = photo.title;

  const date = document.createElement('p');
  date.className = 'gallery-date';
  date.textContent = photo.date;

  item.append(image, title, date);
  item.addEventListener('click', () => openImageModal(photo));
  gallery.append(item);
}

function openImageModal(photo) {
  modalImage.src = photo.hdurl || photo.url;
  modalImage.alt = photo.title;
  modalTitle.textContent = photo.title;
  modalDate.textContent = photo.date;
  modalExplanation.textContent = photo.explanation;
  imageModal.showModal();
}

async function getSpaceImages() {
  const startDate = startInput.value;
  const endDate = endInput.value;

  if (!startDate || !endDate || startDate > endDate) {
    showGalleryMessage('Choose a valid start and end date to find space images.');
    return;
  }

  const parameters = new URLSearchParams({
    start_date: startDate,
    end_date: endDate
  });

  getImagesButton.disabled = true;
  showGalleryMessage('Loading space photos...');

  try {
    const response = await fetch(`${apiUrl}?${parameters}`);
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await response.json()
      : {};

    if (!response.ok) {
      const errorMessage = response.status === 429
        ? 'NASA API rate limit reached. Wait a little while, then try again.'
        : data.msg || data.error?.message || `NASA returned an error (${response.status}).`;
      throw new Error(errorMessage);
    }

    if (!contentType.includes('application/json')) {
      throw new Error(`NASA returned an unexpected response (${response.status}). Try again later.`);
    }

    const imagePhotos = (Array.isArray(data) ? data : [data])
      .filter((photo) => photo.media_type === 'image');
    const photos = imagePhotos.filter((photo) =>
      typeof photo.url === 'string' && !photo.url.includes('/nasa-logo@2x.png')
    );

    gallery.replaceChildren();

    if (photos.length === 0) {
      const message = imagePhotos.length > 0
        ? 'NASA returned a placeholder instead of space photos for these dates. Try another date range later.'
        : 'No space images were found in this date range.';
      showGalleryMessage(message);
      return;
    }

    photos.forEach(addGalleryItem);
  } catch (error) {
    showGalleryMessage(`We could not load the space photos. ${error.message}`);
  } finally {
    getImagesButton.disabled = false;
  }
}

getImagesButton.addEventListener('click', getSpaceImages);
closeModalButton.addEventListener('click', () => imageModal.close());
imageModal.addEventListener('click', (event) => {
  if (event.target === imageModal) {
    imageModal.close();
  }
});
