import { Window } from 'happy-dom';

export const browserWindow = new Window({ url: 'http://localhost/' });

Object.assign(globalThis, {
    self: browserWindow,
    window: browserWindow,
    document: browserWindow.document,
    Node: browserWindow.Node,
    HTMLElement: browserWindow.HTMLElement,
    HTMLInputElement: browserWindow.HTMLInputElement,
    HTMLTextAreaElement: browserWindow.HTMLTextAreaElement,
    HTMLButtonElement: browserWindow.HTMLButtonElement,
    SVGElement: browserWindow.SVGElement,
    Event: browserWindow.Event,
    InputEvent: browserWindow.InputEvent,
    CustomEvent: browserWindow.CustomEvent,
    MutationObserver: browserWindow.MutationObserver,
    getComputedStyle: browserWindow.getComputedStyle.bind(browserWindow),
    requestAnimationFrame: browserWindow.requestAnimationFrame.bind(browserWindow),
    cancelAnimationFrame: browserWindow.cancelAnimationFrame.bind(browserWindow),
});
