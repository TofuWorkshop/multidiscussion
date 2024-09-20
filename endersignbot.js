import {SQLfunctions} from "./IO.js";

import {Bot, session} from "grammy";
import {Menu} from "@grammyjs/menu";
import {chatMembers} from "@grammyjs/chat-members";

import fs from "fs";

const bot = new Bot(fs.readFileSync('token','utf-8'));
// bot.use(session());

const middleware = {
    /** 更新频道管理员列表
     * */
     updateChannelAdmins: async function (id) {
        let newadmins = new Set((await bot.api.getChatAdministrators(id)).map(admininfo => admininfo.user.id));
        console.log(newadmins);
        let oldadmins = new Set(await SQLfunctions.findChannelLastAdmins(id));
        console.log(oldadmins);
            //大概率更多管理员，因此查新数组 O(旧(log(新))
        let shouldremove = [];
        for(let admin in oldadmins) //旧管理员中新管理员没有的
            if(!newadmins.has(admin))
                shouldremove.push(admin);
        console.log(shouldremove);
        if(shouldremove.length) {
            await SQLfunctions.removeChannelAdmins(id, shouldremove);
            //关联删除同admin在该频道创建的关联
            await SQLfunctions.removeSyncWithChannelAdmins(id, shouldremove);
        }
        let shouldadd = [];
        for(let admin of newadmins){
            if(!oldadmins.has(admin))
                shouldadd.push(admin);
        }
        console.log(shouldadd);
        if(shouldadd.length)
            await SQLfunctions.addChannelAdmins(id, shouldadd);
        return newadmins;
     }
}


/*** ********************* 事件处理 *********************** ***/

bot.on('my_chat_member', async (ctx) => {
    const botAddingStatus   = ['member', 'administrator', 'restricted'];
    const botRemovingStatus = ['left', 'kicked'];

    const new_status = ctx.myChatMember.new_chat_member.status;
    const processer = ctx.myChatMember.from;

    if(ctx.myChatMember.chat.type === "private")
        return;
    /** 入群事件
     *  将群聊录入数据库
     */
    if(botAddingStatus.includes(new_status))
    {
        if(ctx.myChatMember.new_chat_member.status === "administrator")
            SQLfunctions.updateChatAdmins(ctx.chat.id,
                (await ctx.getChatAdministrators()).map( m => m.user.id)
            )

        const info = `进入新会话，会话id${ctx.chat.id},类型：+${ctx.chat.type}`;
        ctx.api.sendMessage(processer.id, info)
            .then()
            .catch(e => console.error('向处理人私聊失败：',e.message, '\n', e.stack));

        SQLfunctions.recordChat(ctx.chat.id, ctx.chat.type)
            .then(
                ()=> console.log('已记录会话')
            ).catch(
            e => console.error('记录会话失败: ', e.message, '\n', e.stack)
        )
    }
    /** 离群事件
     * 从数据库移出群聊
     * */
    else if(botRemovingStatus.includes(new_status))
    {
        console.log('被移出会话，会话id'+ctx.chat.id);
        SQLfunctions.removeMyChat(ctx.chat.id, ctx.chat.type)
            .then(
                ()=> console.log('移出会话成功')
            ).catch(
            e => console.error('移出会话失败', e.message, '\n', e.stack)
        );
    }
})

bot.on("chat_member", async (ctx, next) => {
    const memberLeftStatus = ["kicked", "left"];

    const new_status = ctx.chatMember.new_chat_member.status;

    if(memberLeftStatus.includes(new_status))//TODO: 管理员判断优化入Filter
    {
        if(ctx.chatMember.old_chat_member.status === "administrator")//TODO: 如果是creater呢
        {
            SQLfunctions.removeChatAdmins()
        }
        ctx.reply(`${ctx.from.first_name}移除了${ctx.chatMember.old_chat_member.user.first_name}`);
    }
    else{
        if(ctx.chatMember.new_chat_member.status === "administrator")
        {
            SQLfunctions.addChatAdmins(ctx.chatId, [ctx.chatMember.from.id]);
        }
        ctx.reply(`${ctx.from.first_name}让${ctx.chatMember.new_chat_member.user.first_name}加入群聊`)
    }
});

//频道消息
//可以确定机器人在该频道
bot.on('channel_post', async (ctx) => {
    console.log('监听到频道消息，会话id'+ctx.chat.id);
    const chat_id = ctx.chat.id;
    if(!await SQLfunctions.checkChannelRecorded(chat_id))
        SQLfunctions.addChannel(chat_id)
    let admins = await middleware.updateChannelAdmins(chat_id);
    //TODO: 查找所有同步关系并同步频道消息
    let Syncs = SQLfunctions.findSyncviaChannels(chat_id);
    for(let row in Syncs)
            ctx.copyMessage(row.group, chat_id, ctx.message_id);
})


bot.on('edited_message');

/*** ********************* 命令 *********************** ***/

bot.api.setMyCommands([
     {command: 'start',description:'思达'}
    ,{command: 'help', description: '帮助信息'}

    ,{command: 'listen', description: '监听频道'}
    ,{command: 'sync', description: '同步'},

    {command: 'postsign', description: '贴一张同步公告'}
    ,{command: 'makesign', description: '创建一张同步公告'}

    ,{command: 'repeat', description: '复读引用的内容'}
    ,{command: 'status', description: 'bot当前状态'}

    ,{command: 'members', description: '获取成员'}
    ]
).then(() =>{

}).catch(err=>{

});

let sync_menu = new Menu('4sync');
bot.use(sync_menu);
bot.command("sync",(ctx) => {
    let menu = new Menu('channels_common');
    let rows = SQLfunctions.searchCommonChannels();
    for (let i = 0; i <rows.length; i++) {
        menu.text(rows[i].title).row();
    }
    ctx.reply("选择频道",{reply_markup: sync_menu});
})

bot.command("members", async(ctx) => {
    let members =await ctx.getChatAdministrators();
    SQLfunctions.updateChatAdmins(ctx.chatId, members.map((m => m.user.id)))
    ctx.reply('管理员：\n' +
        members.map(m => m.user.first_name)
            .join('\n')
    );
})

bot.command("start", (ctx)=>{
    SQLfunctions.recordUser(ctx.message.from.id, ctx.message.from.is_bot);
    ctx.reply("你谁啊ban了。");
})

bot.command('repeat', (ctx) => {
    const replied = ctx.message.reply_to_message;
    if(replied)
    {
        ctx.copyMessage(ctx.chatId, replied);
    }
})

const start_time = process.hrtime();
bot.command('status',async (ctx)=>{
    ctx.reply(
        `内存用量：${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB\n` +
        `运行时间：${process.hrtime(start_time)[0]}秒\n` +
        `同步关系：${await SQLfunctions.getSyncCount()}条`
    );
})

/*** ********************* 测试区 *********************** ***/

bot.start({allowed_updates:["my_chat_member", "chat_member", "message"]});

console.log('机器人复活');

// 监听评论群 和 目标群