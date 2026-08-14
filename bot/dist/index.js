import { Bot, InlineKeyboard } from 'grammy';
import dotenv from 'dotenv';
dotenv.config();
const token = process.env.BOT_TOKEN;
if (!token)
    throw new Error('BOT_TOKEN no definido');
const bot = new Bot(token);
// URL de tu Mini App en GitHub Pages
const MINI_APP_URL = 'https://lastbostbender.github.io/lastBulwark/';
bot.command('start', async (ctx) => {
    const mensaje = `
Has llegado al Último Bastión. No hay bienvenida, no hay celebración. Solo el rumor del viento entre grietas y el olor a metal quemado.

Para sobrevivir, necesitas un nombre y un destino. Abre la Mini App y elige tu camino.
  `;
    const keyboard = new InlineKeyboard().webApp('Abrir Mini App', MINI_APP_URL);
    await ctx.reply(mensaje, { reply_markup: keyboard });
});
bot.start();
