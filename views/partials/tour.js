"use strict";



//  P A C K A G E S

const dedent = require("dedent");
const html = require("choo-async/html");
const raw = require("nanohtml/raw");



//  E X P O R T

module.exports = exports = () => dedent`
  <section class="tour">
    <ul class="tour__sidebar">
      ${raw(sidebar())}
    </ul>
    <section class="tour__content">${raw(step1())}</section>
  </section>
`;



function sidebar() { // TODO: Save tutorial position to localStorage
  return dedent`
    <li class="tour__sidebar__step" data-action="tour, step 1" data-step="1">
      <button type="button">Resolve a claim</button>
      <span>Get details of media (aka, "claim" metadata)</span>
    </li>

    <li class="tour__sidebar__step" data-action="tour, step 2" data-step="2">
      <button type="button">Publish content</button>
      <span>Create a meme and upload it to the LBRY blockchain</span>
    </li>

    <li class="tour__sidebar__step" data-action="tour, step 3" data-step="3">
      <button type="button">Support with LBC</button>
      <span>Support creators on LBRY with a tip, on us!</span>
    </li>
  `;
}



function step1() {
  return html`
    <div class="tour__content__urlbar">
      <span>lbry://</span><input id="fetch-claim-uri" placeholder="&thinsp;Enter a LBRY address or select an example below" type="text"/>
      <button class="button" data-action="execute claim" type="button">Resolve</button>
    </div>

    <div class="tour__content__trends" id="tour-loader"></div>
    <div id="tour-results"></div>
  `;
}
