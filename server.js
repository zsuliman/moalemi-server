require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); 

const saudiCities = {
  'الرياض': { lat: 24.7136, lon: 46.6753, name: 'الرياض' },
  'جدة': { lat: 21.4858, lon: 39.1925, name: 'جدة' },
  'مكة': { lat: 21.3891, lon: 39.8579, name: 'مكة المكرمة' },
  'المدينة': { lat: 24.5247, lon: 39.5692, name: 'المدينة المنورة' },
  'الدمام': { lat: 26.4207, lon: 50.0888, name: 'الدمام' }
};
const weatherKeywords = ['طقس', 'جو', 'مطر', 'أمطار', 'حرارة', 'درجة الحرارة'];

app.post('/ask', async (req, res) => {
  try {
    const { question, imageBase64, history } = req.body;
    
    if (!question && !imageBase64) {
      return res.status(400).json({ answer: 'الرجاء إرسال سؤال أو صورة.' });
    }

    let weatherSecretContext = '';
    if (question && weatherKeywords.some(kw => question.includes(kw))) {
      let targetCity = saudiCities['الرياض'];
      for (const [ar, data] of Object.entries(saudiCities)) {
        if (question.includes(ar)) { targetCity = data; break; }
      }
      try {
        const weatherRes = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${targetCity.lat}&longitude=${targetCity.lon}&current_weather=true`, { timeout: 5000 });
        if (weatherRes.data?.current_weather) {
          const temp = Math.round(weatherRes.data.current_weather.temperature);
          weatherSecretContext = `\n[معلومة سرية: درجة الحرارة الآن في ${targetCity.name} هي ${temp} مئوية.]`;
        }
      } catch (err) {}
    }

    // المنع القاطع والحاسم للصور العلمية الدقيقة
    let systemPrompt = `أنت معلم ذكي ومبدع. التزم بالآتي حرفياً:
1. توليد الصور [IMAGE: description]: مسموح فقط وفقط للمواضيع الوصفية (مثل الحيوانات، المعالم التاريخية، الفضاء، النباتات).
2. حظر الصور العلمية: يُمنع منعاً باتاً وتحت أي ظرف توليد صور لمسائل الرياضيات، الفيزياء، المخططات البيانية، أو أي مسألة تحتوي على أرقام وقوى متجهة. إذا طلب الطالب ذلك، اعتذر بلباقة وأخبره أنك ستركز على الشرح النصي الدقيق لتجنب أي تشتيت بصري، ثم قم بشرح المسألة تفصيلياً.
3. الشرح الدقيق: اشرح بوضوح وحل المسائل خطوة بخطوة.
4. الرياضيات: استخدم الرموز العادية ويمنع أكواد LaTeX.
5. الطقس: إذا سأل عن الطقس ولم تتوفر المعلومة، اطلب منه ذكر اسم مدينته.${weatherSecretContext}`;

    let apiMessages = [{ role: 'system', content: systemPrompt }];

    if (history && Array.isArray(history)) {
      history.forEach(msg => {
        const role = msg.role === 'ai' ? 'assistant' : 'user';
        if (msg.text) {
          apiMessages.push({ role: role, content: msg.text });
        }
      });
    }

    let currentContent = [];
    if (question) currentContent.push({ type: "text", text: question });
    else if (imageBase64) currentContent.push({ type: "text", text: "اشرح لي هذه الصورة." });

    if (imageBase64) {
      currentContent.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
      });
    }
    
    apiMessages.push({ role: 'user', content: currentContent });

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-4o-mini',
        messages: apiMessages,
        temperature: 0.1, // حرارة منخفضة جداً لضمان الالتزام الصارم
      },
      {
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 30000 
      }
    );

    let answer = response.data?.choices?.[0]?.message?.content || '';
    if (!answer.trim()) return res.json({ answer: 'المعلم يجمع أفكاره 🧠، يرجى المحاولة مرة أخرى.' });
    answer = answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    let aiImageBase64 = null;
    const imageRegex = /\[IMAGE:\s*(.+?)\]/i;
    let match = answer.match(imageRegex);

    if (match) {
      let keywords = match[1].replace(/[^a-zA-Z0-9\s,]/g, '').trim().substring(0, 150);
      answer = answer.replace(match[0], '').trim(); 
      
      if (keywords.length > 2) {
        const randomSeed = Math.floor(Math.random() * 1000000);
        const encodedKeywords = encodeURIComponent(keywords);
        const imgUrl = `https://image.pollinations.ai/prompt/${encodedKeywords}?width=800&height=400&nologo=true&seed=${randomSeed}`;
        
        try {
          const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 15000 });
          aiImageBase64 = Buffer.from(imgRes.data, 'binary').toString('base64');
        } catch (err) {
          console.error('Backend Image Fetch Error:', err.message);
        }
      }
    }

    return res.json({ answer: answer, aiImageBase64: aiImageBase64 });

  } catch (error) {
    console.error('API ERROR:', error.response?.data || error.message);
    return res.status(500).json({ answer: 'حدث خطأ أثناء التواصل مع المعلم الذكي.' });
  }
});

const PORT = 3000;
app.listen(PORT, () => { console.log(`🚀 Server running on port ${PORT} with Strict Ban on Math Diagrams!`); });