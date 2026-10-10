export const levels = ['A1','A2','B1','B2','C1','C2'];
export const scenarios = [
 {id:'cafe',icon:'☕',title:'A little coffee, a little conversation',short:'At the café',place:'EVERYDAY LIFE · OSLO',role:'barista',goal:'Order a drink, ask about the price, and choose where to sit.',opening:'Hei! Hva kan jeg hjelpe deg med?',phrases:[['Jeg vil gjerne ha en kaffe.','I would like a coffee.'],['Hva koster den?','How much does it cost?'],['Kan jeg få havremelk?','Can I have oat milk?'],['Jeg vil sitte her.','I would like to sit here.']], replies:['Vil du ha en liten eller en stor kaffe?','Vil du ha noe å spise til?','Skal du sitte her eller ta med?','Det blir 45 kroner. Vil du betale med kort?']},
 {id:'train',icon:'↗',title:'Your next stop: a conversation',short:'At the station',place:'GETTING AROUND · BERGEN',role:'ticket agent',goal:'Buy a ticket, ask when the train leaves, and find your platform.',opening:'Hei! Hvor vil du reise?',phrases:[['En billett til Oslo, takk.','One ticket to Oslo, please.'],['Når går neste tog?','When does the next train leave?'],['Hvilket spor går toget fra?','Which platform does the train leave from?'],['Er det et direkte tog?','Is it a direct train?']],replies:['Vil du reise i dag eller i morgen?','Vil du ha en enkeltbillett eller tur-retur?','Toget går fra spor tre. Trenger du hjelp med noe mer?','God tur!']},
 {id:'neighbor',icon:'⌂',title:'Make yourself at home',short:'Meet a neighbour',place:'PEOPLE & CULTURE · TRONDHEIM',role:'neighbour',goal:'Introduce yourself, talk about your neighbourhood, and make a plan.',opening:'Hei! Er du ny i bygget?',phrases:[['Jeg har nettopp flyttet hit.','I have just moved here.'],['Hyggelig å møte deg!','Nice to meet you!'],['Er det en butikk i nærheten?','Is there a shop nearby?'],['Vil du ta en kaffe en dag?','Would you like to have a coffee sometime?']],replies:['Velkommen! Hvor bodde du før?','Hva liker du å gjøre på fritiden?','Har du vært på kafeen rundt hjørnet?','Vi kan ta en kaffe der på lørdag!']}
];
export function mockReply(scenario, text, turn) {
 const normalized = text.trim().toLocaleLowerCase('nb-NO');
 const correction = /jeg er gå(?=\s|[.!?,;:]|$)/.test(normalized) ? {before:'Jeg er gå',after:'Jeg går',why:'Use the present tense “går”. Norwegian does not use “am going” in this way.'} : null;
 let reply = scenario.replies[turn % scenario.replies.length];
 if (scenario.id === 'cafe' && /koster|pris/.test(normalized)) reply = 'En liten kaffe koster 35 kroner, og en stor koster 45 kroner.';
 if (scenario.id === 'cafe' && /havremelk/.test(normalized)) reply = 'Ja, vi har havremelk. Vil du ha en liten eller en stor kaffe?';
 if (scenario.id === 'train' && /når/.test(normalized)) reply = 'Neste tog går klokka ti. Vil du ha en billett?';
 if (scenario.id === 'neighbor' && /butikk/.test(normalized)) reply = 'Ja, det er en butikk rett rundt hjørnet.';
 return {reply,correction};
}
const texts = {
 A1:['Biblioteket er åpent på søndag. Det åpner klokka tolv. Du kan lese bøker der.','En park har en ny benk. Benken er grønn. Du kan sitte der.'],
 A2:['Biblioteket skal være åpent på søndager fra klokka tolv. Besøkende kan lese, låne bøker og bruke datamaskinene.','Det er satt opp en ny benk i parken. Benken står ved lekeplassen, slik at foreldre kan sitte mens barna leker.'],
 B1:['Biblioteket utvider åpningstidene og holder nå åpent på søndager fra klokka tolv. Målet er å gi flere tilgang til bøker og et rolig sted å studere.','Etter ønsker fra beboerne har kommunen satt opp en benk ved lekeplassen. Flere håper at dette vil gjøre parken til en hyggeligere møteplass.'],
 B2:['Bibliotekets nye søndagsåpning skal gjøre tilbudet mer tilgjengelig for dem som jobber i uka. Samtidig stiller enkelte spørsmål ved om utvidelsen kan gjennomføres innenfor dagens budsjett.','Kommunens nye benk ved lekeplassen er et beskjedent tiltak, men beboerne mener den kan styrke nærmiljøet. Kritikere etterlyser likevel en helhetlig plan for vedlikehold av parken.'],
 C1:['Søndagsåpningen begrunnes med bibliotekets rolle som en inkluderende møteplass. Selv om tiltaket kan senke terskelen for deltakelse, avhenger den langsiktige verdien av om bemanningen og finansieringen følger ambisjonene.','Benken ved lekeplassen fremstår som et lite grep med mulig sosial betydning. Hvorvidt tiltaket faktisk styrker fellesskapet, avhenger imidlertid av at det inngår i en mer gjennomtenkt prioritering av offentlige rom.'],
 C2:['At bibliotekets dører åpnes på søndager, kan leses som et løfte om at fellesskapets rom skal være tilgjengelige også utenfor arbeidsukas rytme. Men dersom løftet innfris ved å tynne ut bemanningen, risikerer tilgjengeligheten å bli mer symbolsk enn reell.','En ny benk kan vanskelig bære hele kommunens visjon om levende nærmiljøer. Likevel er det nettopp i slike tilsynelatende uanselige tiltak at avstanden mellom politiske ambisjoner og hverdagsliv tidvis blir synlig.']
};
export function exercise(level, variant=0) {
 if (!levels.includes(level)) throw new Error('Unknown level');
 const v=variant%2, advanced=levels.indexOf(level)>=3;
 const questions = v===0 ? (advanced ? ['What tension does the speaker introduce?',['Access versus resources','Books versus computers','Sunday versus Saturday'],0,'The speaker contrasts greater access with the resources needed to sustain it.'] : ['Når åpner biblioteket på søndager?',['Klokka ti','Klokka tolv','Klokka åtte'],1,'The speaker says the library opens at twelve.']) : (advanced ? ['What is the main reservation about the bench?',['It is the wrong colour','It is too far from the park','A single measure may be insufficient'],2,'The speaker questions whether a small measure alone can fulfil broader goals.'] : ['Hvor står den nye benken?',['I parken','På biblioteket','På stasjonen'],0,'The new bench is in the park.']);
 return {title:v===0?'A new chapter for the library':'A place to pause',text:texts[level][v],question:questions[0],options:questions[1],answer:questions[2],explanation:questions[3],level,source:'Original fictional fixture · no publisher content',note:'Illustrative difficulty, not a validated CEFR assessment.'};
}

// Fixed windows are a local demo; production segmentation uses speech boundaries.
export function splitClips(duration, seconds=20) {
 if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(seconds) || seconds < 5) return [];
 const clips=[];
 for(let start=0; start<duration; start+=seconds) clips.push({start,end:Math.min(start+seconds,duration)});
 return clips;
}
