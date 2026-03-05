-- 百人一首論文 IPSJ SIG 形式で生成するAppleScript
-- sig-ms2023.dotテンプレートを使用してWordで開き、コンテンツを挿入する

set templatePath to (POSIX path of "/Users/maruyama/Documents/GitHub/Kikiwake/sig-ms2023.dot")
set outputPath to (POSIX path of "/Users/maruyama/Documents/GitHub/Kikiwake/paper_output.docx")

tell application "Microsoft Word"
	-- テンプレートを開く
	set newDoc to make new document with properties {attached template:templatePath}

	tell newDoc
		tell active window
			tell selection
				-- タイトル（日本語）
				set style of active paragraph to style "IPSJ タイトル" of newDoc
				type text "百人一首の早押し音声識別タスクにおける"
				type return
				type text "行動決定時刻の計測システムとその予備的分析"
				type return
				-- 英語タイトル
				set style of active paragraph to style "IPSJ タイトル" of newDoc
				type text "A Measurement System for Decision Timing in a Rapid-Response Poetry Recognition Task Using Ogura Hyakunin-isshu"
				type return
			end tell
		end tell
	end tell

	save newDoc in outputPath with replace existing
	close newDoc
end tell
