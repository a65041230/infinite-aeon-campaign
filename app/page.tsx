"use client";

import React, { useEffect, useState } from "react";

export default function Home() {
  const [glitch, setGlitch] = useState(false);
  const [scanning, setScanning] = useState(0);

  // Simulate hud scan and glitch effects
  useEffect(() => {
    const glitchInterval = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 200);
    }, 5000);

    const scanInterval = setInterval(() => {
      setScanning(prev => (prev >= 100 ? 0 : prev + 1));
    }, 50);

    return () => {
      clearInterval(glitchInterval);
      clearInterval(scanInterval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#020202] text-gray-300 font-mono selection:bg-[#00ff41] selection:text-black pb-24 relative overflow-hidden">

      {/* Global Grid & Scanline Background */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'linear-gradient(rgba(0, 255, 65, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 65, 0.1) 1px, transparent 1px)',
          backgroundSize: '30px 30px'
        }}>
      </div>
      <div className="fixed inset-0 z-0 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/always-grey.png')] opacity-10"></div>

      {/* HUD Scanning Line */}
      <div
        className="fixed w-full h-[2px] bg-[#00ff41] z-0 opacity-50 shadow-[0_0_10px_#00ff41]"
        style={{ top: `${scanning}%` }}
      />

      {/* Header / Navigation */}
      <header className="fixed top-0 w-full z-50 bg-[#020202]/90 backdrop-blur-md border-b-2 border-[#00ff41]/30">
        <div className="max-w-7xl mx-auto px-6 py-3 flex justify-between items-center text-xs">
          <div className="flex items-center space-x-4">
            <span className="animate-pulse w-2 h-2 bg-red-600 rounded-full"></span>
            <div className={`font-bold tracking-widest ${glitch ? 'text-white' : 'text-[#00ff41]'}`}>
              SYSTEM <span className="text-gray-500">INFINITE_AEON</span> V.2.0
            </div>
          </div>
          <nav className="space-x-8 uppercase tracking-widest hidden md:flex text-[#00ff41]/70 items-center">
            <a href="#attack" className="flex flex-col items-center hover:text-[#00ff41] hover:bg-[#00ff41]/10 px-2 py-1 transition-colors border border-transparent hover:border-[#00ff41]/50 group">
              <span>&lt;TACTICS /&gt;</span>
              <span className="text-[10px] text-gray-500 group-hover:text-[#00ff41] mt-0.5">// 戰術導覽</span>
            </a>
            <a href="#tiers" className="flex flex-col items-center hover:text-[#00ff41] hover:bg-[#00ff41]/10 px-2 py-1 transition-colors border border-transparent hover:border-[#00ff41]/50 group">
              <span>&lt;GEAR_UNLOCK /&gt;</span>
              <span className="text-[10px] text-gray-500 group-hover:text-[#00ff41] mt-0.5">// 裝備解鎖</span>
            </a>
            <div className="text-orange-500 flex flex-col items-end border-l border-gray-800 pl-4 ml-4">
              <span>STATUS: ACTIVE</span>
              <span className="text-gray-500 text-[10px]">// 系統運作中</span>
            </div>
          </nav>
        </div>
      </header>

      <main className="relative z-10">
        {/* --- Hero Section --- */}
        <section className="relative pt-40 pb-20 lg:pt-56 lg:pb-32 flex flex-col items-center text-center px-4">
          <div className="max-w-5xl mx-auto border-l-4 border-[#00ff41] pl-6 md:pl-10 relative">

            {/* HUD Corner Accents */}
            <div className="absolute top-0 right-0 w-16 h-16 border-t-2 border-r-2 border-[#00ff41] opacity-50"></div>
            <div className="absolute bottom-0 left-0 w-16 h-16 border-b-2 border-l-2 border-[#00ff41] opacity-50 -ml-10"></div>

            <div className="flex justify-center md:justify-start items-center space-x-3 mb-8">
              <span className="px-2 py-1 bg-orange-600 text-black text-xs font-bold tracking-widest">&gt;_ WARNING</span>
              <span className="text-orange-500 text-xs tracking-widest">CRITICAL SYSTEM OVERHAUL <span className="text-gray-500">// 重大系統重啟</span></span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter mb-6 text-white leading-none text-left uppercase">
              一次準備，<span className="text-[#00ff41]">七年安心</span>。<br />
              <span className="text-gray-400 text-3xl md:text-4xl mt-3 block">超越業界規格的高階防災模組。</span>
            </h1>

            <p className="text-lg lg:text-xl text-gray-500 mb-12 max-w-3xl leading-relaxed text-left border-l border-gray-800 pl-4 font-sans mt-8">
              <span className="font-mono text-[#00ff41] text-xs tracking-widest block mb-2">[INITIATING SURVIVAL PROTOCOL // 啟動生存協議]</span>
              不再為過期汰換煩惱，專為極端環境打造的生存防線。<br className="hidden md:block" />這不僅是防災包，而是您的家庭 <strong className="text-white font-bold">離網生存核心樞紐</strong>。
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-6 justify-start">
              <a href="#cta" className="relative group inline-block">
                <div className="absolute inset-0 bg-[#00ff41] transform translate-x-1 translate-y-1 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform"></div>
                <div className="relative px-8 py-4 bg-[#0a0f0d] border border-[#00ff41] text-[#00ff41] group-hover:bg-[#00ff41] group-hover:text-black font-bold uppercase tracking-widest transition-colors flex items-center">
                  <span className="mr-3">解鎖 7 年安心防線</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </a>
              <div className="text-xs text-gray-500 tracking-widest flex flex-col justify-start text-left">
                <span>[ STATUS: PENDING // 部署待命 ]</span>
                <span className="text-orange-500 mt-1">&gt; 獲取超早鳥 65 折權限</span>
              </div>
            </div>

          </div>
        </section>

        {/* --- Blackout Scenario --- */}
        <section className="py-24 border-t border-[#00ff41]/20 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#0a0f0d] via-[#020202] to-black relative">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex items-start md:items-center flex-col md:flex-row gap-8 lg:gap-16 border border-red-900/30 bg-black/60 p-8 md:p-12 relative overflow-hidden backdrop-blur-sm">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-transparent"></div>
              <div className="absolute opacity-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-96 h-96 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={0.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>

              <div className="md:w-1/3 relative z-10 border-l border-red-600 pl-6">
                <div className="text-red-500 text-sm font-bold tracking-widest mb-2">[ BLACKOUT_SCENARIO ]</div>
                <div className="text-gray-400 text-xs tracking-widest mb-6">// 72小時離網極限</div>
                <h2 className="text-3xl md:text-5xl font-black text-white uppercase leading-none mt-2">
                  極端孤立 <br /><span className="text-red-500">72HR</span>
                </h2>
              </div>

              <div className="md:w-2/3 relative z-10 text-gray-400 font-sans leading-relaxed text-lg lg:text-xl border-t md:border-t-0 md:border-l border-gray-800 pt-6 md:pt-0 md:pl-8">
                <p className="mb-4 text-white">傳統防災包最大的致命傷：<strong className="text-red-500 bg-red-900/20 px-1 py-0.5">預設救援會馬上抵達。</strong></p>
                <p>
                  但真實的極端災害中，往往伴隨著橋樑毀損、通訊中斷。你與家人必須面對長達至少 72 小時的「斷電、斷水、無熱食」孤立狀態。
                </p>
                <div className="mt-8 flex items-center space-x-3 text-sm text-[#00ff41] font-mono">
                  <div className="h-px bg-[#00ff41] w-12 opacity-50"></div>
                  <span>Infinite Aeon 是您的最後防線，讓您在基礎設施癱瘓時，依然維持生命尊嚴。</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --- Tactical Head-to-Head Attack Section --- */}
        <section id="attack" className="py-24 border-t border-gray-900 bg-[#050505] relative">
          <div className="max-w-6xl mx-auto px-6">

            <div className="flex items-center space-x-4 mb-16">
              <div className="flex-shrink-0 w-12 h-12 bg-orange-600 flex items-center justify-center text-black font-bold text-xl">X</div>
              <div className="flex-1">
                <h2 className="text-2xl md:text-3xl font-bold text-white uppercase tracking-wider">戰術盲點分析 / <span className="text-orange-500">CRITICAL FLAWS</span></h2>
                <div className="text-[#00ff41] text-xs mt-1 tracking-widest truncate">EXECUTING COMPETITOR_ANALYSIS.EXE <span className="text-gray-500">// 執行對競品弱點掃描</span></div>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">

              {/* Energy War */}
              <div className="bg-[#0a0a0a] border border-gray-800 p-8 relative group overflow-hidden flex flex-col">
                <div className="absolute top-0 right-0 bg-red-900/40 text-red-500 px-3 py-1 text-[10px] sm:text-xs font-bold border-l border-b border-red-900 flex whitespace-nowrap">
                  ! ENERGY_FAIL <span className="ml-2 text-gray-400 font-normal hidden sm:inline">// 能源阻斷</span>
                </div>
                <div className="text-4xl text-gray-800 font-black mb-4 group-hover:text-gray-700 transition-colors">01</div>
                <h3 className="text-xl font-bold text-white mb-3 tracking-wide uppercase">行動電源兩年就廢？</h3>
                <p className="text-gray-500 text-sm mb-6 pb-6 border-b border-gray-800 flex-grow font-sans">
                  鋰電池閒置老化，危難時發現完全沒電。傳統防災包的電力方案形同虛設。
                </p>
                <div className="mt-2">
                  <div className="text-[#00ff41] text-[10px] sm:text-xs mb-3 font-bold tracking-widest flex items-center bg-[#00ff41]/10 py-1.5 px-2 border border-[#00ff41]/20">
                    <span className="w-1.5 h-1.5 bg-[#00ff41] mr-2"></span> SOLUTION_PROTOCOL <span className="text-gray-400 font-normal ml-auto">// 火力方案</span>
                  </div>
                  <div className="text-gray-300 leading-relaxed font-sans font-medium text-[15px]">
                    15W 摺疊太陽能板 ＆ 水感應燈。<br />
                    <span className="text-[#00ff41] mt-1 block px-2 py-1 bg-[#00ff41]/5 border-l-2 border-[#00ff41]">有光有水，就有極限環境的電力再生。</span>
                  </div>
                </div>
              </div>

              {/* Water War */}
              <div className="bg-[#0a0a0a] border border-gray-800 p-8 relative group overflow-hidden flex flex-col">
                <div className="absolute top-0 right-0 bg-red-900/40 text-red-500 px-3 py-1 text-[10px] sm:text-xs font-bold border-l border-b border-red-900 flex whitespace-nowrap">
                  ! WATER_FAIL <span className="ml-2 text-gray-400 font-normal hidden sm:inline">// 水源枯竭</span>
                </div>
                <div className="text-4xl text-gray-800 font-black mb-4 group-hover:text-gray-700 transition-colors">02</div>
                <h3 className="text-xl font-bold text-white mb-3 tracking-wide uppercase">瓶裝水喝完等死？</h3>
                <p className="text-gray-500 text-sm mb-6 pb-6 border-b border-gray-800 flex-grow font-sans">
                  每人每天需3公升水，重達3公斤。避難包裝不了幾瓶，喝完後只能面對髒污自來水或雨水。
                </p>
                <div className="mt-2">
                  <div className="text-[#00ff41] text-[10px] sm:text-xs mb-3 font-bold tracking-widest flex items-center bg-[#00ff41]/10 py-1.5 px-2 border border-[#00ff41]/20">
                    <span className="w-1.5 h-1.5 bg-[#00ff41] mr-2"></span> SOLUTION_PROTOCOL <span className="text-gray-400 font-normal ml-auto">// 火力方案</span>
                  </div>
                  <div className="text-gray-300 leading-relaxed font-sans font-medium text-[15px]">
                    Sawyer Mini 軍事級濾水系統。<br />
                    <span className="text-[#00ff41] mt-1 block px-2 py-1 bg-[#00ff41]/5 border-l-2 border-[#00ff41]">將野外泥水直接轉化成生飲水，無極限水源。</span>
                  </div>
                </div>
              </div>

              {/* Food War */}
              <div className="bg-[#0a0a0a] border border-gray-800 p-8 relative group overflow-hidden flex flex-col">
                <div className="absolute top-0 right-0 bg-red-900/40 text-red-500 px-3 py-1 text-[10px] sm:text-xs font-bold border-l border-b border-red-900 flex whitespace-nowrap">
                  ! FOOD_FAIL <span className="ml-2 text-gray-400 font-normal hidden sm:inline">// 熱食匱乏</span>
                </div>
                <div className="text-4xl text-gray-800 font-black mb-4 group-hover:text-gray-700 transition-colors">03</div>
                <h3 className="text-xl font-bold text-white mb-3 tracking-wide uppercase">口糧難吃又過期？</h3>
                <p className="text-gray-500 text-sm mb-6 pb-6 border-b border-gray-800 flex-grow font-sans">
                  廉價壓縮餅乾難以下嚥、保存期短，且在極端壓力下完全無法提供心靈撫慰的作用。
                </p>
                <div className="mt-2">
                  <div className="text-[#00ff41] text-[10px] sm:text-xs mb-3 font-bold tracking-widest flex items-center bg-[#00ff41]/10 py-1.5 px-2 border border-[#00ff41]/20">
                    <span className="w-1.5 h-1.5 bg-[#00ff41] mr-2"></span> SOLUTION_PROTOCOL <span className="text-gray-400 font-normal ml-auto">// 火力方案</span>
                  </div>
                  <div className="text-gray-300 leading-relaxed font-sans font-medium text-[15px]">
                    日本阿爾法米 ＋ 台灣在地高階肉類餐包。<br />
                    <span className="text-[#00ff41] mt-1 block px-2 py-1 bg-[#00ff41]/5 border-l-2 border-[#00ff41]">長效保存，為災難帶來尊榮溫暖的 5-7 年熱食循環。</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* --- Gear Manifest --- */}
        <section className="py-24 border-t border-gray-900 relative bg-[#020202]">
          <div className="max-w-5xl mx-auto px-6">
            <div className="border border-gray-800 p-6 sm:p-10 relative overflow-hidden bg-gradient-to-br from-[#0c0f0d] to-black group">

              <div className="absolute top-0 left-0 border-t-4 border-l-4 border-orange-500 w-12 h-12 transition-all duration-500 group-hover:w-full group-hover:h-full group-hover:border-opacity-20 opacity-80 pointer-events-none z-0"></div>

              <div className="relative z-10 flex flex-col md:flex-row md:items-end md:justify-between mb-10 border-b border-gray-800 pb-6">
                <div>
                  <div className="text-orange-500 text-sm font-bold tracking-widest mb-1 flex items-center">
                    <span className="animate-pulse w-2 h-2 bg-orange-500 mr-2 inline-block"></span> [ GEAR_MANIFEST ]
                  </div>
                  <h2 className="text-3xl font-bold text-white uppercase tracking-widest">
                    全能民防組
                  </h2>
                  <div className="text-gray-500 font-sans mt-2 tracking-wide font-medium">// 核心武裝火力解密 (NT$ 6,800 定價款)</div>
                </div>
                <div className="mt-6 md:mt-0 px-4 py-2 border border-[#00ff41]/30 bg-[#00ff41]/5 text-[#00ff41] text-xs font-mono uppercase text-center w-full md:w-auto">
                  RECOMMENDED_TACTICAL_LOADOUT
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-x-12 gap-y-10 relative z-10 font-sans">

                {/* Module 1 */}
                <div className="flex start">
                  <div className="text-3xl text-gray-800 font-mono font-bold mr-4">01</div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                      <span className="text-[#00ff41]">■</span> 無盡能源模組
                    </h3>
                    <p className="text-gray-400 text-sm leading-relaxed mb-3">
                      15W 摺疊太陽能板配備軍規防潑水，結合遇水即亮的應急照明燈。徹底擺脫依賴會膨脹老化的行動電源。
                    </p>
                    <div className="flex gap-2 text-[10px] font-mono tracking-widest">
                      <span className="bg-[#111] px-2 py-1 text-gray-500 border border-gray-800">SOLAR_PANEL</span>
                      <span className="bg-[#111] px-2 py-1 text-gray-500 border border-gray-800">WATER_SENSOR_LED</span>
                    </div>
                  </div>
                </div>

                {/* Module 2 */}
                <div className="flex start">
                  <div className="text-3xl text-gray-800 font-mono font-bold mr-4">02</div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                      <span className="text-orange-500">■</span> 無限水源再生
                    </h3>
                    <p className="text-gray-400 text-sm leading-relaxed mb-3">
                      標配美軍現役 Sawyer Mini 微濾水系統，搭配大容量摺疊水袋。不再儲存笨重的瓶裝水，直接將雨水河水轉化。
                    </p>
                    <div className="flex gap-2 text-[10px] font-mono tracking-widest">
                      <span className="bg-[#111] px-2 py-1 text-gray-500 border border-gray-800">SAWYER_MINI_FILTER</span>
                      <span className="bg-[#111] px-2 py-1 text-gray-500 border border-gray-800">WATER_POUCH</span>
                    </div>
                  </div>
                </div>

                {/* Module 3 */}
                <div className="flex start">
                  <div className="text-3xl text-gray-800 font-mono font-bold mr-4">03</div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                      <span className="text-[#00ff41]">■</span> 生存尊榮熱食
                    </h3>
                    <p className="text-gray-400 text-sm leading-relaxed mb-3">
                      日本原裝 Alpha 脫水米，常溫冷水即可發泡。搭配特製高耐受台灣燉肉調理包，在廢墟中重新定義災雞熱食體驗。
                    </p>
                    <div className="flex gap-2 text-[10px] font-mono tracking-widest">
                      <span className="bg-[#111] px-2 py-1 text-gray-500 border border-gray-800">ALPHA_RICE_5DAYS</span>
                      <span className="bg-[#111] px-2 py-1 text-gray-500 border border-gray-800">MRE_MEATS</span>
                    </div>
                  </div>
                </div>

                {/* Module 4 */}
                <div className="flex start">
                  <div className="text-3xl text-gray-800 font-mono font-bold mr-4">04</div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                      <span className="text-red-500">■</span> 衛生疫病阻絕
                    </h3>
                    <p className="text-gray-400 text-sm leading-relaxed mb-3">
                      災後最可怕的是排泄物污染。模組內建 15 回緊急消臭抗菌便袋系統與濕紙巾，維持基本人權與極致衛生。
                    </p>
                    <div className="flex gap-2 text-[10px] font-mono tracking-widest">
                      <span className="bg-[#111] px-2 py-1 text-gray-500 border border-gray-800">BIO_WASTE_BAGS</span>
                      <span className="bg-[#111] px-2 py-1 text-gray-500 border border-gray-800">ANTIBACTERIAL</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </section>

        {/* --- Pricing Tiers & Gear Unlock --- */}
        <section id="tiers" className="py-24 border-t border-[#00ff41]/20 bg-[#000000] relative">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00ff41]/50 to-transparent"></div>
          <div className="max-w-6xl mx-auto px-6 relative z-10">
            <div className="flex flex-col items-center mb-16 border-b border-gray-800 pb-8">
              <h2 className="text-3xl font-bold text-white uppercase tracking-widest mb-1">&lt; LOADOUT_CONFIG &gt;</h2>
              <p className="text-gray-500 text-[10px] sm:text-xs tracking-widest flex items-center gap-2">
                CHOOSE YOUR TIER <span className="text-[#00ff41]">// 選擇您的防護等級解鎖</span>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

              {/* TIER 1 */}
              <div className="border border-gray-800 bg-[#080808] p-6 hover:border-gray-500 transition-colors flex flex-col group">
                <div className="flex justify-between items-center mb-1">
                  <div className="text-gray-500 text-xs font-bold tracking-widest">TIER_01</div>
                  <div className="text-gray-600 text-[10px]">// 入門方案</div>
                </div>
                <h3 className="text-xl font-bold text-white uppercase tracking-wider mb-4 group-hover:text-gray-300">城市避難</h3>
                <div className="text-2xl text-gray-400 font-bold mb-6 font-sans">
                  <span className="text-sm text-gray-600 mr-1">TWD</span>3,980
                </div>
                <ul className="space-y-3 flex-grow text-sm text-gray-400 font-sans mb-8">
                  <li className="flex items-start"><span className="text-gray-600 mr-2 font-mono">[-]</span> 鋁箔保溫面罩</li>
                  <li className="flex items-start"><span className="text-gray-600 mr-2 font-mono">[-]</span> 3M 防切割手套</li>
                  <li className="flex items-start"><span className="text-gray-600 mr-2 font-mono">[-]</span> 基礎急救模組</li>
                  <li className="flex items-start"><span className="text-gray-600 mr-2 font-mono">[-]</span> 長效光源棒</li>
                </ul>
                <button className="w-full py-4 bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:border-white transition-colors text-[10px] sm:text-xs tracking-widest uppercase font-bold text-center flex flex-col items-center">
                  <span>REQUEST_ACCESS</span>
                  <span className="font-normal text-gray-500 mt-1 lowercase">&gt; 登記此配置</span>
                </button>
              </div>

              {/* TIER 2 - HIGHLIGHT */}
              <div className="border-2 border-[#00ff41] bg-[#050f08] p-6 relative transform lg:-translate-y-4 flex flex-col shadow-[0_0_30px_rgba(0,255,65,0.05)] hover:shadow-[0_0_40px_rgba(0,255,65,0.15)] transition-shadow">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#00ff41] text-black text-[10px] font-bold px-3 py-1 uppercase tracking-widest whitespace-nowrap">
                  RECOMMENDED &nbsp;//&nbsp; 推薦解鎖
                </div>
                <div className="flex justify-between items-center mb-1">
                  <div className="text-[#00ff41] text-xs font-bold tracking-widest">TIER_02</div>
                  <div className="text-[#00ff41]/50 text-[10px]">// 主流方案</div>
                </div>
                <h3 className="text-xl font-bold text-white uppercase tracking-wider mb-4">全能民防 </h3>
                <div className="text-3xl text-[#00ff41] font-bold mb-6 font-sans">
                  <span className="text-sm text-[#00ff41]/50 mr-1">TWD</span>6,800
                </div>
                <ul className="space-y-3 flex-grow text-sm text-gray-300 font-sans mb-8">
                  <li className="flex items-start text-[#00ff41] border-b border-[#00ff41]/20 pb-2 mb-2"><span className="mr-2 font-mono">&gt;</span> 包含 TIER_01 所有裝備</li>
                  <li className="flex items-start"><span className="text-[#00ff41] mr-2 font-mono">[+]</span> 日台尊榮熱食組 <span className="text-gray-500 ml-1">(5日)</span></li>
                  <li className="flex items-start"><span className="text-[#00ff41] mr-2 font-mono">[+]</span> 15W 摺疊太陽能板</li>
                  <li className="flex items-start"><span className="text-[#00ff41] mr-2 font-mono">[+]</span> Sawyer Mini 濾水器</li>
                  <li className="flex items-start"><span className="text-[#00ff41] mr-2 font-mono">[+]</span> 消臭排泄處理系統</li>
                </ul>
                <button className="w-full py-4 bg-[#00ff41] text-black font-black hover:bg-white transition-colors text-[10px] sm:text-xs tracking-widest uppercase text-center flex flex-col items-center">
                  <span>SELECT_LOADOUT</span>
                  <span className="font-bold text-gray-800 mt-1 lowercase">&gt; 解鎖火力支援</span>
                </button>
              </div>

              {/* TIER 3 */}
              <div className="border border-orange-900 bg-[#080808] p-6 hover:border-orange-500/50 transition-colors flex flex-col group">
                <div className="flex justify-between items-center mb-1">
                  <div className="text-orange-500 text-xs font-bold tracking-widest">TIER_03</div>
                  <div className="text-orange-600/50 text-[10px]">// 旗艦方案</div>
                </div>
                <h3 className="text-xl font-bold text-white uppercase tracking-wider mb-4 group-hover:text-orange-100">守護者</h3>
                <div className="text-2xl text-orange-400 font-bold mb-6 font-sans">
                  <span className="text-sm text-orange-900 mr-1">TWD</span>12,800
                </div>
                <ul className="space-y-3 flex-grow text-sm text-gray-400 font-sans mb-8">
                  <li className="flex items-start text-orange-500 border-b border-orange-900/30 pb-2 mb-2"><span className="mr-2 font-mono">&gt;</span> 包含 TIER_02 所有裝備</li>
                  <li className="flex items-start"><span className="text-orange-500 mr-2 font-mono">[+]</span> 太陽能升級 <span className="text-gray-500 ml-1">(21W毯)</span></li>
                  <li className="flex items-start"><span className="text-orange-500 mr-2 font-mono">[+]</span> 半罩式防毒面罩</li>
                  <li className="flex items-start"><span className="text-orange-500 mr-2 font-mono">[+]</span> 攜帶式手搖發電機</li>
                </ul>
                <button className="w-full py-4 bg-[#0a0503] border border-orange-900 text-orange-500 hover:bg-orange-900/30 hover:text-orange-400 transition-colors text-[10px] sm:text-xs tracking-widest uppercase font-bold text-center flex flex-col items-center">
                  <span>REQUEST_ACCESS</span>
                  <span className="font-normal text-orange-700 mt-1 lowercase">&gt; 登記此配置</span>
                </button>
              </div>

              {/* TIER 4 */}
              <div className="border border-red-900 bg-[#080505] p-6 relative flex flex-col">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 pointer-events-none"></div>
                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex justify-between items-center mb-1">
                    <div className="text-red-500 text-xs font-bold tracking-widest">APEX</div>
                    <div className="text-red-700/80 text-[10px]">// 概念兵裝</div>
                  </div>
                  <h3 className="text-xl font-bold text-white uppercase tracking-wider mb-4">Infinite_Aeon_Apex</h3>
                  <div className="text-2xl text-red-500 font-bold mb-6 font-sans">
                    <span className="text-sm text-red-900 mr-1">TWD</span>19,800+
                  </div>
                  <ul className="space-y-3 flex-grow text-sm text-gray-400 font-sans mb-8">
                    <li className="flex items-start text-red-500 border-b border-red-900/30 pb-2 mb-2"><span className="mr-2 font-mono">&gt;</span> 包含 TIER_03 所有裝備</li>
                    <li className="flex items-start"><span className="text-red-500 mr-2 font-mono">[!]</span> 戰術變形基地包</li>
                    <li className="flex items-start"><span className="text-red-500 mr-2 font-mono">[!]</span> Restube 求生浮標</li>
                    <li className="flex items-start"><span className="text-red-500 mr-2 font-mono">[!]</span> 5級防穿刺手套</li>
                  </ul>
                  <div className="border-t border-red-900/50 pt-4 flex-none">
                    <button className="w-full py-3 border border-red-700 bg-red-900/10 text-red-500 hover:bg-red-900 hover:text-white transition-colors text-[10px] sm:text-xs tracking-widest uppercase font-bold mb-2">
                      UNLOCK_APEX
                    </button>
                    <div className="text-[10px] text-red-500/50 text-center font-sans tracking-wide">
                      // 限量接單生產，嚴格審核
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* --- Unified CTA Section --- */}
        <section id="cta" className="py-32 border-t border-[#00ff41]/50 bg-[#020202] text-center px-6 relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,255,65,0.05)_0%,transparent_50%)]"></div>
          <div className="max-w-2xl mx-auto relative z-10 border border-[#00ff41]/30 p-8 sm:p-12 bg-[#050505] shadow-[0_0_50px_rgba(0,255,65,0.05)]">
            <div className="flex justify-center mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-[#00ff41]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-widest">初始化您的專屬防線</h2>
            <div className="text-gray-500 font-mono text-xs mb-8 tracking-widest">// DEPLOYMENT_READY</div>

            <p className="text-[#00ff41]/90 mb-10 text-[15px] font-sans leading-relaxed">
              系統登錄通道即將關閉。立即輸入驗證代碼 (Email)，<br className="hidden sm:block" />以獲取最高 <span className="bg-[#00ff41]/20 text-[#00ff41] px-1 py-0.5 font-bold border border-[#00ff41]/50">35% 早鳥特權折扣</span>，並在新版本部署時第一時間通知。
            </p>

            <form className="flex flex-col gap-4">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#00ff41] font-mono">&gt;</span>
                <input
                  type="email"
                  placeholder="ENTER_EMAIL_ADDRESS"
                  className="w-full bg-black border border-[#00ff41]/50 px-10 py-5 text-[#00ff41] placeholder-[#00ff41]/30 focus:outline-none focus:border-[#00ff41] focus:shadow-[0_0_15px_rgba(0,255,65,0.2)] transition-all font-mono uppercase text-sm"
                  required
                />
              </div>
              <button
                type="submit"
                onClick={(e) => e.preventDefault()}
                className="w-full py-5 bg-[#00ff41] hover:bg-white text-black font-black uppercase tracking-widest transition-colors shadow-[0_0_20px_rgba(0,255,65,0.4)] flex items-center justify-center gap-2 group"
              >
                <span>EXECUTE / 登記解鎖通知</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </form>
          </div>
        </section>
      </main>

      {/* Footer / Status Bar */}
      <footer className="fixed bottom-0 w-full bg-black border-t border-gray-800 text-[10px] text-gray-600 py-1.5 px-4 flex justify-between tracking-widest z-50">
        <div>SYS.OP: NORMAL <span className="hidden sm:inline-block ml-1">// 系統正常</span></div>
        <div className="hidden sm:block text-[#00ff41]/50">GRID: SECURE</div>
        <div>{new Date().toISOString().split('T')[0]} / V.2.0.4</div>
      </footer>
    </div>
  );
}
