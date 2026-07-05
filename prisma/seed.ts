import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

import { hashPassword } from '../src/server/password';

const db = new PrismaClient();

const PALETTES: Array<[ string, string ]> = [
    [ '#1e2a78', '#d97706' ],
    [ '#3b0764', '#db2777' ],
    [ '#064e3b', '#84cc16' ],
    [ '#7c2d12', '#facc15' ],
    [ '#0c4a6e', '#22d3ee' ],
    [ '#4c0519', '#f97316' ],
    [ '#1c1917', '#a8a29e' ],
    [ '#312e81', '#34d399' ],
];

function writePoster(slug: string, title: string, year: number, index: number) {
    const [ from, to ] = PALETTES[index % PALETTES.length];
    const escapedTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const words = escapedTitle.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
        if ((current + ' ' + word).trim().length > 14) {
            if (current) lines.push(current.trim());
            current = word;
        } else {
            current = `${current} ${word}`;
        }
    }
    if (current.trim()) lines.push(current.trim());

    const textLines = lines
        .slice(0, 4)
        .map(
            (line, i) =>
                `<text x="150" y="${330 + i * 34}" text-anchor="middle" fill="#ffffff" font-family="Helvetica, Arial, sans-serif" font-size="26" font-weight="bold">${line}</text>`,
        )
        .join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="300" height="450" fill="url(#bg)"/>
  <circle cx="150" cy="170" r="64" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="6"/>
  <circle cx="150" cy="170" r="22" fill="#ffffff" fill-opacity="0.35"/>
  ${textLines}
  <text x="150" y="${330 + Math.min(lines.length, 4) * 34}" text-anchor="middle" fill="#ffffff" fill-opacity="0.7" font-family="Helvetica, Arial, sans-serif" font-size="20">${year}</text>
</svg>`;

    const dir = join(import.meta.dirname, '..', 'public', 'posters');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${slug}.svg`), svg, 'utf8');
    return `/posters/${slug}.svg`;
}

const MOVIES = [
    { kind: 'MOVIE', slug: 'solaris-echo', title: 'Эхо Соляриса', year: 2024, country: 'Россия', director: 'Анна Климова', genres: [ 'фантастика', 'драма' ], durationMin: 138, description: 'Экипаж орбитальной станции у далёкой планеты сталкивается с явлением, которое заставляет каждого встретиться со своим прошлым. Медленное, гипнотическое размышление о памяти и вине.' },
    { kind: 'MOVIE', slug: 'midnight-express-2', title: 'Полночный экспресс', year: 2023, country: 'Франция', director: 'Люк Моро', genres: [ 'триллер', 'нуар' ], durationMin: 112, description: 'Ночной поезд Париж — Стамбул, исчезнувший пассажир и проводница, которая знает больше, чем говорит. Классический нуар в современных декорациях.' },
    { kind: 'CARTOON', slug: 'paper-cranes', title: 'Бумажные журавли', year: 2025, country: 'Япония', director: 'Хару Танака', genres: [ 'драма', 'семейный' ], durationMin: 104, description: 'Пожилой мастер оригами и его внучка-подросток учатся понимать друг друга через тысячу бумажных журавлей. Тихое, светлое кино о связи поколений.' },
    { slug: 'iron-harvest', title: 'Железная жатва', year: 2024, country: 'Германия', director: 'Клара Фишер', genres: [ 'военный', 'драма' ], durationMin: 147, description: 'Послевоенная деревня, поля, усеянные ржавым железом, и две семьи, которые делят одну землю и одну тайну.' },
    { slug: 'neon-tide', title: 'Неоновый прилив', year: 2025, country: 'США', director: 'Джордан Вэйл', genres: [ 'киберпанк', 'боевик' ], durationMin: 121, description: 'Курьерша подпольной сети в затопленном мегаполисе получает груз, за которым охотятся все корпорации города. Дождь, неон и погони по каналам.' },
    { slug: 'silent-vineyard', title: 'Тихий виноградник', year: 2023, country: 'Италия', director: 'Марко Белли', genres: [ 'мелодрама' ], durationMin: 98, description: 'Сомелье из Милана приезжает продать дедовский виноградник и остаётся на целый сезон. История о вкусе, времени и втором шансе.' },
    { slug: 'cartographer', title: 'Картограф', year: 2024, country: 'Исландия', director: 'Сигрун Олафсдоттир', genres: [ 'приключения', 'драма' ], durationMin: 116, description: 'Картограф XIX века наносит на карту последний белый участок острова и находит там то, чего на картах не бывает.' },
    { kind: 'SERIES', slug: 'seventh-floor', title: 'Седьмой этаж', year: 2025, country: 'Южная Корея', director: 'Ким Чжи Хун', genres: [ 'триллер', 'детектив' ], durationMin: 109, seasonsCount: 2, episodesPerSeason: [ 8, 8 ], trailerUrls: [ 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' ], description: 'В офисном здании каждую пятницу гаснет свет ровно на семь минут. Новый охранник решает выяснить почему. Герметичный триллер с двойным дном.' },
    { slug: 'wind-orchestra', title: 'Духовой оркестр', year: 2022, country: 'Чехия', director: 'Павел Новак', genres: [ 'комедия', 'музыкальный' ], durationMin: 95, description: 'Маленький городок готовится к столетию местного оркестра, но дирижёр сбегает за неделю до юбилея. Тёплая комедия о людях, которые не умеют играть поодиночке.' },
    { kind: 'SERIES', slug: 'glass-river', title: 'Стеклянная река', year: 2024, country: 'Канада', director: 'Эмили Росс', genres: [ 'драма', 'спорт' ], durationMin: 124, seasonsCount: 1, episodesPerSeason: [ 10 ], description: 'Бывшая чемпионка по гребле возвращается тренером в родной клуб на замерзающей реке. Спортивная драма без единого лишнего слова.' },
    { slug: 'last-projectionist', title: 'Последний киномеханик', year: 2023, country: 'Аргентина', director: 'Диего Варгас', genres: [ 'драма' ], durationMin: 101, description: 'Старый кинотеатр в Буэнос-Айресе закрывается, и киномеханик решает устроить последний сеанс — для всех, кто когда-то приходил сюда.' },
    { slug: 'honey-and-ash', title: 'Мёд и пепел', year: 2025, country: 'Грузия', director: 'Нино Каландадзе', genres: [ 'драма', 'семейный' ], durationMin: 107, description: 'После пожара на пасеке три сестры возвращаются в горное село, чтобы восстановить дело отца — и заново собрать семью.' },
    { kind: 'CARTOON', slug: 'zero-gravity-waltz', title: 'Вальс в невесомости', year: 2024, country: 'Великобритания', director: 'Оливер Грант', genres: [ 'фантастика', 'мелодрама' ], durationMin: 119, description: 'Двое техников орбитального отеля остаются одни на станции на полгода. Камерная история о любви на высоте четырёхсот километров.' },
    { slug: 'salt-road', title: 'Соляной путь', year: 2022, country: 'Марокко', director: 'Юсуф Бен Али', genres: [ 'приключения', 'исторический' ], durationMin: 132, description: 'Караван последнего соляного торговца пересекает Сахару в 1930-е, когда грузовики уже начали вытеснять верблюдов. Эпос об уходящем мире.' },
] as const;

const USERS = [
    { email: 'demo@movienest.dev', name: 'Демо' },
    { email: 'ayurash@me.com', name: 'Ayurash', role: 'ADMIN' },
    { email: 'anna@movienest.dev', name: 'Анна' },
    { email: 'boris@movienest.dev', name: 'Борис' },
    { email: 'vera@movienest.dev', name: 'Вера' },
    { email: 'gleb@movienest.dev', name: 'Глеб' },
    { email: 'dasha@movienest.dev', name: 'Даша' },
] as const;

function daysAgo(days: number) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// Deterministic pseudo-random so reseeding is stable
function mulberry32(seed: number) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

async function main() {
    console.log('Seeding MovieNest…');

    await db.userFriend.deleteMany();
    await db.rating.deleteMany();
    await db.session.deleteMany();
    await db.movie.deleteMany();
    await db.user.deleteMany();

    const passwordHash = hashPassword('demo123');
    const users = [];
    for (const u of USERS) {
        users.push(await db.user.create({ data: { ...u, role: 'role' in u ? u.role : 'USER', passwordHash } }));
    }

    const rand = mulberry32(42);
    const movies = [];
    for (let i = 0; i < MOVIES.length; i++) {
        const m = MOVIES[i];
        const posterUrl = writePoster(m.slug, m.title, m.year, i);
        movies.push(
            await db.movie.create({
                data: {
                    title: m.title,
                    kind: 'kind' in m ? m.kind : 'MOVIE',
                    year: m.year,
                    country: m.country,
                    description: m.description,
                    director: m.director,
                    genres: [ ...m.genres ],
                    durationMin: m.durationMin,
                    seasonsCount: 'seasonsCount' in m ? m.seasonsCount : null,
                    episodesPerSeason: 'episodesPerSeason' in m ? [ ...m.episodesPerSeason ] : [],
                    trailerUrls: 'trailerUrls' in m ? [ ...m.trailerUrls ] : [],
                    posterUrl,
                    createdById: users[i % users.length].id,
                    createdAt: daysAgo(2 + i * 4),
                },
            }),
        );
    }

    // Spread ratings over the last 45 days so weekly/monthly tops differ
    let ratingCount = 0;
    for (const movie of movies) {
        for (const user of users) {
            if (rand() < 0.35) continue; // not everyone rates everything
            const value = 2 + Math.floor(rand() * 4); // 2..5
            const age = Math.floor(rand() * 45); // 0..44 days ago
            const createdAt = daysAgo(age);
            await db.rating.create({
                data: {
                    movieId: movie.id,
                    userId: user.id,
                    value,
                    createdAt,
                },
            });
            ratingCount++;
        }
    }

    console.log(`Done: ${users.length} users, ${movies.length} movies, ${ratingCount} ratings.`);
    console.log('Demo login: demo@movienest.dev / demo123');
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(() => db.$disconnect());
