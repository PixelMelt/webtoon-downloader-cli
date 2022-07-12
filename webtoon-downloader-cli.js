const PDFDocument = require('pdfkit');
const axios = require('axios');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require('fs');
const { dir } = require('console');
const { image } = require('pdfkit');
const cliProgress = require('cli-progress');
const prompt = require('prompt');


async function getWebsite(url) {
  return axios.get(url);
}

function pharseEpisode(ep) {
    ep = ep.replace(/\n/g, '').replace(/\s\s\s+/g, ' ');
    let date = ep.match(/<span class="date">(.*?)<\/span>/i)[1].substring(1)
    let link = `https://www.webtoons.com${ep.match(/<a href="https:\/\/www.webtoons.com(\/.*)" class="NPI=a:list,i=.*,r=.*,g:(.*?)">/i)[1]}`
    let result = {
        number: ep.match(/<span class="tx">#(.*?)<\/span>/i)[1],
        title: ep.match(/<span class="subj"><span>(.*?)<\/span><\/span>/i)[1],
        link: link.replace(`&amp;`,`&`),
        lang: ep.match(/<a href="https:\/\/www.webtoons.com(\/.*)" class="NPI=a:list,i=.*,r=.*,g:(.*?)">/i)[2],
        date: date.substring(0, date.length - 1),
        likes: ep.match(/<span class="like_area _likeitArea"><em class="ico_like _btnLike _likeMark">like<\/em>(.*?)<\/span>/i)[1]
    };
    return result;
}

function findWebtoonPage(maxep,wantedEp){
    //loop maxep times
    let pages = maxep / 10
    //round up to nearest 1
    pages = Math.ceil(pages)
    for(let i = 1; i <= pages; i++){
        //check if wanted ep is in this page
        let ep = i * 10
        if(ep >= wantedEp){
            // find what page and what place on that page the ep is
            let place = (maxep - (pages * 10 - ep)) - wantedEp
            let page = (pages - i) + 1
            if(place < 0){
                page = page - 1
                place = place + 10
            }
            return {
                page: page,
                place: place
            }
        }
    }
}

function directorySetup(comic, ep){
    //check if folder exists in one line
    if(!fs.existsSync(`./webtoons`)){
        fs.mkdirSync(`./webtoons`);
        console.log(`> Webtoons folder not found so created`);
    }
    if(comic !== undefined){
        if(!fs.existsSync(`./webtoons/${comic}`)){
            fs.mkdirSync(`./webtoons/${comic}`);
            console.log(`> Comic folder not found so created`);
        }
        if(!fs.existsSync(`./webtoons/${comic}/wholeComics`)){
            fs.mkdirSync(`./webtoons/${comic}/wholeComics`);
            console.log(`> Whole comic folder not found so created`);
        }
    }
    if(ep != undefined){
        if(!fs.existsSync(`./webtoons/${comic}/${ep}`)){
            fs.mkdirSync(`./webtoons/${comic}/${ep}`);
            console.log(`> Episode folder not found so created`);
        }
    }
}

function getComicName(html){
    let comicName = `Unable to find comic name`
    if(html.querySelectorAll(`#content > div.cont_box > div.detail_header.challenge > div.info.challenge > h3`)[0] != undefined){
        comicName = html.querySelectorAll(`#content > div.cont_box > div.detail_header.challenge > div.info.challenge > h3`)[0].innerHTML
        comicName = comicName.replace(/\n/g, '').replace(/\s\s\s+/g, ' ').substring(1);
        comicName = comicName.substring(0, comicName.length - 1);
    }else{
        comicName = html.querySelectorAll(`#content > div.cont_box > div.detail_header.type_black > div.info > h1`)[0].innerHTML
        comicName = comicName.replace(/\n/g, '').replace(/\s\s\s+/g, ' ');
    }
    return comicName
}

async function downloadToonImages(link,imageAmount,document,comicName,comicInfo){
    // make loading bar
    const imageDownloadProgress = new cliProgress.SingleBar({}, cliProgress.Presets.legacy);
    imageDownloadProgress.start(imageAmount, 0);
    // download images
    for(let i = 0; i < imageAmount; i++){
        imageDownloadProgress.update(i + 1);
        //check if image exists
        if(!fs.existsSync(`./webtoons/${comicName}/${comicInfo.number}/${i+1}.jpg`)){
            let image = document.querySelectorAll(`#_imageList`)[0].children[i].getAttribute('data-url')
            image = image.replace(`?type=q90`,``)
            // console.log(image)
            // console.log(`Downloading image ${i + 1} of ${imageAmount}`);
    
            let requestChallenge = {
                comicName: link.match(/https:\/\/www\.webtoons\.com\/en\/.*?\/(.*?)\/list\?title_no=(.*)/i)[1],
                comicNumber: link.match(/https:\/\/www\.webtoons\.com\/en\/.*?\/(.*?)\/list\?title_no=(.*)/i)[2],
            }
            
            let challengeUrl = `https://www.webtoons.com/ajax/episode/challenge?title_no=${requestChallenge.comicNumber}&episode_no=${comicInfo.number}`
    
            // console.log(`Generated challenge url ${challengeUrl}`);
    
            async function downloadImage(url){
                // Writer stream where we want to download the image
                const writer = fs.createWriteStream(`./webtoons/${comicName}/${comicInfo.number}/${i + 1}.jpg`);
            
                const streamResponse = await axios({
                    url,
                    method: 'GET',
                    headers: {
                        'Host': 'webtoon-phinf.pstatic.net',
                        'Referer': challengeUrl,
                        'Content-Type': 'image/jpeg',
                        'Cache-Control': 'max-age=2592000',
                        'Accept-Ranges': 'bytes',
                        'Cookie': `pagGDPR=true;`
                    },
                    // that the point!!!
                    // change responseType to stream
                    // pipe only work with 'stream'
                    responseType: 'stream'
                });
            
                // Write data
                streamResponse.data.pipe(writer);
            
                writer.on('finish', async () => {
                    // console.log("Finished");
                    return true
                });
                writer.on('error', () => {
                    console.error(`Error while dowloading image ${i + 1}`);
                    return false
                });
            }
            
            let downloadStatus = await downloadImage(image);
    
            if(downloadStatus){
                // console.log(`Image ${i + 1} downloaded`);
            }
        }else{
            // console.log(`Image ${i + 1} already exists, skipping`);
        }


    }
    imageDownloadProgress.stop()
}

async function createPDF(comicName,comicInfo,imageAmount){
    try{
        if(!fs.existsSync(`./webtoons/${comicName}/wholeComics/${comicInfo.number}: ${comicInfo.title}.pdf`)){
            doc = new PDFDocument({
                autoFirstPage: false
            })
            //Pipe its output somewhere, like to a file or HTTP response
            doc.pipe(fs.createWriteStream(`./webtoons/${comicName}/wholeComics/${comicInfo.number}: ${comicInfo.title}.pdf`));
            
            //check how many images are in the folder
            let imageCount = imageAmount
            // console.log(`Total images: ${imageCount}`);
        
            //loop through all images
            for(let imagePart = 1; imagePart < imageCount + 1; imagePart++){
                let img = `./webtoons/${comicName}/${comicInfo.number}/${imagePart}.jpg`
                // Load a image from a file
                // console.log(`adding image ${imagePart} of ${imageCount}`);

                // make sure files are downloaded before adding to pdf
                // check if this is the last image
                if(imagePart == imageCount){
                    console.log(`Waiting for images to finish downloading`);
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
                let imageContent = doc.openImage(`./webtoons/${comicName}/${comicInfo.number}/${imagePart}.jpg`);
                // add page that is the same size as the image and then add the image
                doc.addPage({
                    size: [imageContent.width, imageContent.height]
                }).image(img, 0,0);
            }
            doc.end()
            console.log(`PDF created\n`)
        }else{
            console.log(`PDF ${comicInfo.number}: ${comicInfo.title}.pdf already exists\n`);
        }
        return true
    }catch(err){
        console.log(err)
        return false
    }
}

async function downloadWebtoon(link,startep,endep){
    if(!link.includes(`https://www.webtoons.com/`) && !link.includes(`/list?title_no=`)){
        console.log(`Invalid link provided`);
        return
    }
    console.log(``)
    // console.log(`Webtoon link: ${link}`);

    let html = await getWebsite(link)
    // console.log(`Webtoon info received`);

    let comicDocument = new JSDOM(html.data).window.document;

    let comicName = getComicName(comicDocument);

    console.log(`Webtoon name: ${comicName}`);

    let latestepraw = comicDocument.querySelectorAll(`#_listUl`)[0].children[0].innerHTML
    
    let totalEps = pharseEpisode(latestepraw).number
    console.log(`Total episodes: ${totalEps}\n`);
    
    
    if(endep == undefined){
        console.log(`Attempting to download episode ${startep}\n`);
        endep = startep
    }else{
        console.log(`Attempting to download episodes ${startep} to ${endep}\n`);
    }

    for(let i = startep; i <= endep; i++){
        console.log(`Downloading episode ${i}`);
        let targetedEP = findWebtoonPage(totalEps,i)
        // console.log(`Found wanted ep ${startep} on page ${targetedEP.page} in place ${targetedEP.place}`)
    
        // console.log(`Getting link ${link}&page=${targetedEP.page}`);
        let comicPage = await getWebsite(`${link}&page=${targetedEP.page}`)
        let comicdocument = new JSDOM(comicPage.data).window.document;
    
        // console.log(`Comic ${startep} info received`);
        
        let comicInfo = pharseEpisode(comicdocument.querySelectorAll(`#_listUl`)[0].children[targetedEP.place].innerHTML)
        // console.log(comicInfo)
    
        let imagesHtml = await getWebsite(`${comicInfo.link}`)
    
        let document = new JSDOM(imagesHtml.data).window.document;
        let imageAmount = document.querySelectorAll(`#_imageList`)[0].children.length
        console.log(`Total images: ${imageAmount}`);
    
        // check if comic episode folder exists and create if not
        directorySetup(comicName, comicInfo.number)
    
        await downloadToonImages(link,imageAmount,document,comicName,comicInfo)
        console.log(`Downloaded all images`);
    
        if(!await createPDF(comicName,comicInfo,imageAmount)){
            console.log(`Error creating PDF`);
        }
    }
    console.log(`Downloaded episodes!`);
    return
}


// prompt the user for the link and ask the user for the start and end episodes

console.log(`Enter webtoon info`);
prompt.start();

function onErr(err) {
  console.log(err);
  return 1;
}

prompt.get(['Webtoon url', 'Starting episode', 'Ending episode'], function (err, result) {
    if (err) {
        return onErr(err);
    }
    downloadWebtoon(result["Webtoon url"],result[`Starting episode`],result[`Ending episode`]);
});
