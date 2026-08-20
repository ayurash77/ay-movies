import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path: string) {
    try {
        return readFileSync(path, 'utf8');
    } catch {
        return '';
    }
}

test('movie description is not mixed with repeated metadata or a standalone rating', () => {
    const detail = read('src/routes/movies/$movieId.tsx');

    assert.match(detail, /<h2[^>]*>Описание<\/h2>[\s\S]*\{movie\.description\}/);
    assert.doesNotMatch(detail, /function DetailsTable|<DetailsTable/);
    assert.doesNotMatch(detail, /<RatingStars value=\{movie\.avgRating\}/);
    assert.doesNotMatch(detail, /Ваша оценка:[\s\S]*<RatingStars/);
});

test('about section composes trailers, description, ratings, cast, watch links, then comments', () => {
    const detail = read('src/routes/movies/$movieId.tsx');
    const sectionStart = detail.indexOf('function AboutSection');
    const sectionEnd = detail.indexOf('function SeriesTabs');
    const section = detail.slice(sectionStart, sectionEnd);

    const orderedParts = [
        '<TrailerSection',
        'Описание',
        '<MovieRatings',
        '<MovieCast',
        '<WatchLinksSection',
        '<CommentsSection',
    ];
    let previous = -1;
    for (const part of orderedParts) {
        const index = section.indexOf(part);
        assert.ok(index > previous, `${part} должен идти в согласованном порядке`);
        previous = index;
    }

    assert.match(detail, /<SeriesSeasons movie=\{movie\}\/>/);
});

test('ratings band renders only available provider tiles and keeps user stars in AY Movies', () => {
    const ratings = read('src/components/movies/MovieRatings.tsx');

    assert.match(ratings, /Кинопоиск/);
    assert.match(ratings, /IMDb/);
    assert.match(ratings, /Критики/);
    assert.match(ratings, /AY Movies/);
    assert.match(ratings, /externalRatings\.kinopoisk/);
    assert.match(ratings, /externalRatings\.imdb/);
    assert.match(ratings, /externalRatings\.russianCritics/);
    assert.match(ratings, /Intl\.NumberFormat\('ru-RU'\)/);
    assert.match(ratings, /<RatingStars[\s\S]*onRate=\{onRate\}/);
    assert.match(ratings, /auto-fit/);
    assert.doesNotMatch(ratings, /sm:grid-cols-4/);
});

test('cast uses responsive portrait links and expands beyond the first eight actors', () => {
    const cast = read('src/components/movies/MovieCast.tsx');

    assert.match(cast, /slice\(0,\s*8\)/);
    assert.match(cast, /grid-cols-2/);
    assert.match(cast, /lg:grid-cols-4/);
    assert.match(cast, /aspect-2\/3/);
    assert.match(cast, /to="\/people\/\$personId"/);
    assert.match(cast, /Все/);
    assert.match(cast, /Свернуть/);
    assert.match(cast, /member\.role/);
});

test('person page uses the app header and filmography links local or external titles', () => {
    const route = read('src/routes/people/$personId.tsx');
    const filmography = read('src/components/people/PersonFilmography.tsx');

    assert.match(route, /getPerson\(\{ data: \{ personId: params\.personId \} \}\)/);
    assert.match(route, /<PageTitle[\s\S]*leading=\{headerLeading\}/);
    assert.match(route, /aria-label="Назад"/);
    assert.match(route, /<PersonFilmography/);

    assert.match(filmography, /to="\/movies\/\$movieId"/);
    assert.match(filmography, /useLocation/);
    assert.match(filmography, /search=\{\{ from: currentPath \}\}/);
    assert.match(filmography, /https:\/\/www\.kinopoisk\.ru\/film\/\$\{entry\.externalId\}\//);
    assert.match(filmography, /target="_blank"/);
    assert.match(filmography, /rel="noreferrer"/);
    assert.match(filmography, /aspect-2\/3/);
    assert.match(filmography, /formatFilmographyType\(entry\.type\)/);
});
